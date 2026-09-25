import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { OAuth2Client } from 'google-auth-library';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth as getFirebaseAuth } from 'firebase-admin/auth';
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { ulid } from 'ulid';

type CatalogOtpChannel = 'sms' | 'email';
type CatalogAuthProvider =
  | 'google'
  | 'sms_otp'
  | 'email_otp'
  | 'firebase_email_link';

interface CatalogInquiry {
  name: string;
  mobile?: string;
  email?: string;
  message?: string;
}

interface CatalogOtpRequest {
  identifier: string;
}

interface CatalogAccessRequestContext {
  ip: string;
  userAgent?: string;
}

interface CatalogAccessSession {
  customerId: string;
  expiresAt: Date;
  name: string;
  mobile?: string;
  email?: string;
  authProvider: CatalogAuthProvider;
  createdIp: string;
  userAgent?: string;
}

interface CatalogAccessSessionSummary {
  customerId: string;
  expiresAt: Date;
  name: string;
  mobile?: string;
  email?: string;
  authProvider: CatalogAuthProvider;
}

interface CatalogOtpChallenge {
  challengeId: string;
  channel: CatalogOtpChannel;
  contactKey: string;
  mobile?: string;
  email?: string;
  hashedOtp: string;
  attempts: number;
  resendCount: number;
  expiresAt: Date;
  lockedAt?: Date;
  lastSentAt: Date;
  createdIp: string;
  userAgent?: string;
  createdAt: Date;
}

interface CatalogAccessAuditRecord {
  name?: string;
  mobile?: string;
  email?: string;
  message?: string;
  authProvider?: CatalogAuthProvider;
  channel?: CatalogOtpChannel;
  ip: string;
  userAgent?: string;
  status: string;
  createdAt: string;
}

interface CatalogSessionGrant {
  token: string;
  expiresAt: Date;
  authProvider: CatalogAuthProvider;
  email?: string;
  mobile?: string;
  name?: string;
  customerId?: string;
  isNewUser?: boolean;
  profileComplete?: boolean;
}

interface CatalogCustomer {
  customerId: string;
  email?: string;
  mobile?: string;
  name: string;
  profileComplete: boolean;
  createdAt: Date;
  lastLoginAt: Date;
}

export interface CatalogCustomerSummary {
  customer_id: string;
  email: string | null;
  mobile: string | null;
  name: string;
  profile_complete: boolean;
  created_at: string;
  last_login_at: string;
}

interface CatalogEmailLinkChallenge {
  challengeId: string;
  email: string;
  hashedLinkToken: string;
  hashedClaimToken: string;
  expiresAt: Date;
  createdAt: Date;
  completedAt?: Date;
  customerId?: string;
  customerName?: string;
  isNewUser?: boolean;
  profileComplete?: boolean;
}

@Injectable()
export class CatalogAccessService {
  private readonly logger = new Logger(CatalogAccessService.name);
  private firestore?: Firestore;
  private readonly googleOAuthClient = new OAuth2Client();
  private readonly sessions = new Map<string, CatalogAccessSession>();
  private readonly otpChallenges = new Map<string, CatalogOtpChallenge>();
  private readonly emailLinkChallenges = new Map<
    string,
    CatalogEmailLinkChallenge
  >();
  private readonly customers = new Map<string, CatalogCustomer>();
  private readonly auditRecords: CatalogAccessAuditRecord[] = [];

  recordInquiry(inquiry: CatalogInquiry, context: CatalogAccessRequestContext) {
    this.audit(inquiry, context, 'inquiry_recorded');
    this.logger.log(
      `Catalog access inquiry from ${inquiry.name} (${inquiry.mobile ?? inquiry.email ?? 'no contact'})`,
    );

    return {
      ok: true,
      inquiry_only: true,
    };
  }

  async listCustomers(): Promise<{ users: CatalogCustomerSummary[] }> {
    const firestore = this.getOptionalFirestore();
    const customers = firestore
      ? await this.listPersistedCustomers(firestore)
      : [...this.customers.values()];

    return {
      users: customers
        .sort(
          (left, right) =>
            right.lastLoginAt.getTime() - left.lastLoginAt.getTime(),
        )
        .map((customer) => ({
          customer_id: customer.customerId,
          email: customer.email ?? null,
          mobile: customer.mobile ?? null,
          name: customer.name,
          profile_complete: customer.profileComplete,
          created_at: customer.createdAt.toISOString(),
          last_login_at: customer.lastLoginAt.toISOString(),
        })),
    };
  }

  async createGoogleAccess(
    idToken: string,
    context: CatalogAccessRequestContext,
  ): Promise<CatalogSessionGrant> {
    const clientIds = this.getGoogleClientIds();

    if (clientIds.length === 0) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    try {
      const ticket = await this.googleOAuthClient.verifyIdToken({
        idToken,
        audience: clientIds.length === 1 ? clientIds[0] : clientIds,
      });
      const payload = ticket.getPayload();
      const email = payload?.email?.trim().toLowerCase();

      if (!payload || !email || payload.email_verified !== true) {
        throw new UnauthorizedException('Verified Google email is required');
      }

      const name = payload.name?.trim() || email;
      const customerId = this.customerIdForIdentity(email);
      const session = await this.createSession(
        {
          customerId,
          name,
          email,
          authProvider: 'google',
        },
        context,
      );

      this.audit({ name, email }, context, 'google_verified', 'google');
      const existingCustomer =
        this.customers.get(customerId) ??
        (await this.loadPersistedCustomer(customerId));
      const now = new Date();
      const customer: CatalogCustomer = {
        customerId,
        email,
        name,
        profileComplete: true,
        createdAt: existingCustomer?.createdAt ?? now,
        lastLoginAt: now,
      };
      this.customers.set(customerId, customer);
      await this.persistCustomer(customer);

      return {
        ...session,
        name,
        email,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.audit({}, context, 'google_verification_failed', 'google');
      throw new UnauthorizedException('Invalid Google sign-in token', {
        cause: error,
      });
    }
  }

  async createFirebaseEmailAccess(
    idToken: string,
    context: CatalogAccessRequestContext,
    handoff?: { challengeId: string; linkToken: string },
  ): Promise<CatalogSessionGrant> {
    try {
      const projectId =
        process.env.FIREBASE_AUTH_PROJECT_ID?.trim() ||
        process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
        'deweb-preview1';
      const firebaseApp =
        getApps()[0] ??
        initializeApp({ credential: applicationDefault(), projectId });
      const decoded = await getFirebaseAuth(firebaseApp).verifyIdToken(idToken);
      const email = decoded.email?.trim().toLowerCase();
      if (!email || decoded.email_verified !== true) {
        throw new UnauthorizedException(
          'A verified Firebase email is required',
        );
      }

      const { customer, isNewUser } =
        await this.findOrCreateEmailCustomer(email);
      if (handoff) {
        const challenge = await this.requireEmailLinkChallenge(
          handoff.challengeId,
          handoff.linkToken,
          'link',
        );
        if (challenge.email !== email) {
          throw new UnauthorizedException(
            'The sign-in link does not match this email address',
          );
        }
        challenge.completedAt = new Date();
        challenge.customerId = customer.customerId;
        challenge.customerName = customer.name;
        challenge.isNewUser = isNewUser;
        challenge.profileComplete = customer.profileComplete;
        await this.persistEmailLinkChallenge(challenge);
      }
      const session = await this.createSession(
        {
          customerId: customer.customerId,
          name: customer.name,
          email,
          authProvider: 'firebase_email_link',
        },
        context,
      );
      this.audit(
        { name: customer.name, email },
        context,
        'firebase_email_link_verified',
        'firebase_email_link',
      );
      return {
        ...session,
        customerId: customer.customerId,
        email,
        name: customer.name,
        isNewUser,
        profileComplete: customer.profileComplete,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.audit(
        {},
        context,
        'firebase_email_link_failed',
        'firebase_email_link',
      );
      throw new UnauthorizedException(
        'Invalid or expired Firebase sign-in link',
        { cause: error },
      );
    }
  }

  async requestFirebaseEmailLink(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const challengeId = ulid();
    const linkToken = this.createAccessToken();
    const claimToken = this.createAccessToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const challenge: CatalogEmailLinkChallenge = {
      challengeId,
      email,
      hashedLinkToken: this.hashSessionToken(linkToken),
      hashedClaimToken: this.hashSessionToken(claimToken),
      expiresAt,
      createdAt: new Date(),
    };
    this.emailLinkChallenges.set(challengeId, challenge);
    await this.persistEmailLinkChallenge(challenge);
    return {
      challenge_id: challengeId,
      link_token: linkToken,
      claim_token: claimToken,
      expires_at: expiresAt.toISOString(),
    };
  }

  async resolveFirebaseEmailLink(challengeId: string, linkToken: string) {
    const challenge = await this.requireEmailLinkChallenge(
      challengeId,
      linkToken,
      'link',
    );
    return { email: challenge.email };
  }

  async claimFirebaseEmailLink(
    challengeId: string,
    claimToken: string,
    context: CatalogAccessRequestContext,
  ): Promise<CatalogSessionGrant | null> {
    const challenge = await this.requireEmailLinkChallenge(
      challengeId,
      claimToken,
      'claim',
    );
    if (
      !challenge.completedAt ||
      !challenge.customerId ||
      !challenge.customerName
    ) {
      return null;
    }
    return this.createSession(
      {
        customerId: challenge.customerId,
        name: challenge.customerName,
        email: challenge.email,
        authProvider: 'firebase_email_link',
      },
      context,
    ).then((session) => ({
      ...session,
      customerId: challenge.customerId,
      name: challenge.customerName,
      email: challenge.email,
      isNewUser: challenge.isNewUser,
      profileComplete: challenge.profileComplete,
    }));
  }

  private async requireEmailLinkChallenge(
    challengeId: string,
    token: string,
    tokenKind: 'link' | 'claim',
  ): Promise<CatalogEmailLinkChallenge> {
    const challenge =
      this.emailLinkChallenges.get(challengeId) ??
      (await this.loadPersistedEmailLinkChallenge(challengeId));
    const expectedHash =
      tokenKind === 'link'
        ? challenge?.hashedLinkToken
        : challenge?.hashedClaimToken;
    const actualHash = this.hashSessionToken(token);
    if (
      !challenge ||
      challenge.expiresAt.getTime() <= Date.now() ||
      !expectedHash ||
      expectedHash.length !== actualHash.length ||
      !timingSafeEqual(Buffer.from(expectedHash), Buffer.from(actualHash))
    ) {
      throw new UnauthorizedException(
        'Invalid or expired email sign-in request',
      );
    }
    return challenge;
  }

  async requestOtp(
    input: CatalogOtpRequest,
    context: CatalogAccessRequestContext,
  ) {
    const identity = this.normalizeIdentifier(input.identifier);
    const channel = identity.channel;
    const contactKey = `${channel}:${identity.destination}`;
    const challengeId = ulid();
    const otp = this.createOtp();
    const expiresAt = new Date(Date.now() + this.getOtpTtlSeconds() * 1000);
    const challenge: CatalogOtpChallenge = {
      challengeId,
      channel,
      contactKey,
      mobile: channel === 'sms' ? identity.destination : undefined,
      email: channel === 'email' ? identity.destination : undefined,
      hashedOtp: this.hashOtp(challengeId, contactKey, otp),
      attempts: 0,
      resendCount: 0,
      expiresAt,
      createdIp: context.ip,
      userAgent: context.userAgent,
      createdAt: new Date(),
      lastSentAt: new Date(),
    };

    this.otpChallenges.set(challengeId, challenge);
    await this.persistChallenge(challenge);

    try {
      await this.sendOtp(challenge, otp);
      this.audit(
        { mobile: challenge.mobile, email: challenge.email },
        context,
        'otp_requested',
        this.getOtpAuthProvider(channel),
        channel,
      );
    } catch (error) {
      this.otpChallenges.delete(challengeId);
      await this.deletePersistedChallenge(challengeId);
      this.audit(
        { mobile: challenge.mobile, email: challenge.email },
        context,
        'otp_delivery_failed',
        this.getOtpAuthProvider(channel),
        channel,
      );
      throw new ServiceUnavailableException('Unable to send OTP', {
        cause: error,
      });
    }

    return {
      ok: true,
      challenge_id: challengeId,
      channel,
      masked_destination: this.maskDestination(challenge),
      expires_at: expiresAt.toISOString(),
      resend_after_seconds: this.getOtpResendAfterSeconds(),
    };
  }

  async verifyOtp(
    input: {
      challenge_id: string;
      code: string;
    },
    context: CatalogAccessRequestContext,
  ): Promise<CatalogSessionGrant> {
    const challenge =
      this.otpChallenges.get(input.challenge_id) ??
      (await this.loadPersistedChallenge(input.challenge_id));

    if (!challenge) {
      this.audit({}, context, 'otp_invalid_challenge');
      throw new BadRequestException('Invalid OTP challenge');
    }

    if (challenge.lockedAt) {
      this.audit(
        challenge,
        context,
        'otp_challenge_locked',
        this.getOtpAuthProvider(challenge.channel),
        challenge.channel,
      );
      throw new UnauthorizedException('OTP challenge is locked');
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      this.otpChallenges.delete(challenge.challengeId);
      await this.deletePersistedChallenge(challenge.challengeId);
      this.audit(
        challenge,
        context,
        'otp_challenge_expired',
        this.getOtpAuthProvider(challenge.channel),
        challenge.channel,
      );
      throw new UnauthorizedException('OTP challenge has expired');
    }

    const otpMatches = await this.verifyDeliveredOtp(challenge, input.code);
    if (!otpMatches) {
      challenge.attempts += 1;

      if (challenge.attempts >= this.getOtpMaxAttempts()) {
        challenge.lockedAt = new Date();
        await this.persistChallenge(challenge);
        this.audit(
          challenge,
          context,
          'otp_challenge_locked',
          this.getOtpAuthProvider(challenge.channel),
          challenge.channel,
        );
        throw new UnauthorizedException('OTP challenge is locked');
      }

      await this.persistChallenge(challenge);
      this.audit(
        challenge,
        context,
        'otp_verification_failed',
        this.getOtpAuthProvider(challenge.channel),
        challenge.channel,
      );
      throw new UnauthorizedException('Invalid OTP');
    }

    const authProvider = this.getOtpAuthProvider(challenge.channel);
    const { customer, isNewUser } = await this.findOrCreateCustomer(challenge);
    const session = await this.createSession(
      {
        customerId: customer.customerId,
        name: customer.name,
        mobile: challenge.mobile,
        email: challenge.email,
        authProvider,
      },
      context,
    );

    this.otpChallenges.delete(challenge.challengeId);
    await this.deletePersistedChallenge(challenge.challengeId);
    this.audit(
      challenge,
      context,
      'otp_verified',
      authProvider,
      challenge.channel,
    );

    return {
      ...session,
      customerId: customer.customerId,
      isNewUser,
      profileComplete: customer.profileComplete,
      name: customer.name,
      mobile: challenge.mobile,
      email: challenge.email,
    };
  }

  async resendOtp(challengeId: string, context: CatalogAccessRequestContext) {
    const challenge =
      this.otpChallenges.get(challengeId) ??
      (await this.loadPersistedChallenge(challengeId));
    if (
      !challenge ||
      challenge.lockedAt ||
      challenge.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Invalid or expired OTP challenge');
    }

    const resendAfterSeconds = this.getOtpResendAfterSeconds();
    const nextAllowedAt =
      challenge.lastSentAt.getTime() + resendAfterSeconds * 1000;
    if (nextAllowedAt > Date.now()) {
      throw new BadRequestException(
        'Please wait before requesting another code',
      );
    }

    const otp = this.createOtp();
    challenge.hashedOtp = this.hashOtp(
      challenge.challengeId,
      challenge.contactKey,
      otp,
    );
    challenge.attempts = 0;
    challenge.resendCount += 1;
    challenge.lastSentAt = new Date();
    challenge.expiresAt = new Date(Date.now() + this.getOtpTtlSeconds() * 1000);
    await this.sendOtp(challenge, otp);
    await this.persistChallenge(challenge);
    this.audit(
      challenge,
      context,
      'otp_resent',
      this.getOtpAuthProvider(challenge.channel),
      challenge.channel,
    );

    return {
      ok: true,
      challenge_id: challenge.challengeId,
      channel: challenge.channel,
      masked_destination: this.maskDestination(challenge),
      expires_at: challenge.expiresAt.toISOString(),
      resend_after_seconds: resendAfterSeconds,
    };
  }

  async validateAccessToken(token: string): Promise<boolean> {
    return (await this.getAccessSession(token)) !== null;
  }

  async revokeAccessSession(token: string | undefined): Promise<void> {
    if (token) {
      this.sessions.delete(token);
      const firestore = this.getOptionalFirestore();
      if (firestore) {
        await firestore
          .collection('catalog_access_sessions')
          .doc(this.hashSessionToken(token))
          .set({ revoked_at: Timestamp.now() }, { merge: true });
      }
    }
  }

  async getAccessSession(
    token: string,
  ): Promise<CatalogAccessSessionSummary | null> {
    const session =
      this.sessions.get(token) ?? (await this.loadPersistedSession(token));

    if (!session) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(token);
      await this.revokeAccessSession(token);
      return null;
    }

    return {
      customerId: session.customerId,
      expiresAt: session.expiresAt,
      name: session.name,
      mobile: session.mobile,
      email: session.email,
      authProvider: session.authProvider,
    };
  }

  private async createSession(
    input: {
      customerId?: string;
      name: string;
      mobile?: string;
      email?: string;
      authProvider: CatalogAuthProvider;
    },
    context: CatalogAccessRequestContext,
  ): Promise<CatalogSessionGrant> {
    const token = this.createAccessToken();
    const expiresAt = new Date(Date.now() + this.getSessionTtlSeconds() * 1000);

    this.sessions.set(token, {
      customerId:
        input.customerId ??
        this.customerIdForIdentity(input.email, input.mobile),
      expiresAt,
      name: input.name,
      mobile: input.mobile,
      email: input.email,
      authProvider: input.authProvider,
      createdIp: context.ip,
      userAgent: context.userAgent,
    });
    await this.persistSession(token, this.sessions.get(token)!);

    return {
      token,
      expiresAt,
      authProvider: input.authProvider,
    };
  }

  private createAccessToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private createOtp(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private hashOtp(
    challengeId: string,
    contactKey: string,
    otp: string,
  ): string {
    return createHash('sha256')
      .update(`${challengeId}:${contactKey}:${otp}`)
      .digest('hex');
  }

  private isOtpMatch(challenge: CatalogOtpChallenge, otp: string): boolean {
    const expected = Buffer.from(challenge.hashedOtp, 'hex');
    const actual = Buffer.from(
      this.hashOtp(challenge.challengeId, challenge.contactKey, otp.trim()),
      'hex',
    );

    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private normalizeIdentifier(identifier: string): {
    channel: CatalogOtpChannel;
    destination: string;
  } {
    const value = identifier.trim();
    if (value.includes('@')) {
      throw new BadRequestException(
        'Email sign-in uses a Firebase secure link',
      );
    }

    const compact = value.replace(/[\s()-]/g, '');
    const mobile = compact.startsWith('+')
      ? compact
      : compact.startsWith('91') && compact.length === 12
        ? `+${compact}`
        : `+91${compact}`;
    if (!/^\+[1-9]\d{7,14}$/.test(mobile)) {
      throw new BadRequestException('Enter a valid mobile number');
    }
    return { channel: 'sms', destination: mobile };
  }

  private maskDestination(challenge: CatalogOtpChallenge): string {
    if (challenge.email) {
      const [local, domain] = challenge.email.split('@');
      return `${local.slice(0, 1)}${'*'.repeat(Math.max(3, local.length - 1))}@${domain}`;
    }
    const mobile = challenge.mobile ?? '';
    return `${mobile.slice(0, 3)} ${'*'.repeat(Math.max(4, mobile.length - 7))}${mobile.slice(-4)}`;
  }

  private customerIdForIdentity(email?: string, mobile?: string): string {
    return createHash('sha256')
      .update(email ? `email:${email}` : `mobile:${mobile ?? ''}`)
      .digest('hex')
      .slice(0, 32);
  }

  private async findOrCreateCustomer(challenge: CatalogOtpChallenge): Promise<{
    customer: CatalogCustomer;
    isNewUser: boolean;
  }> {
    if (challenge.email) {
      return this.findOrCreateEmailCustomer(challenge.email);
    }

    const customerId = this.customerIdForIdentity(
      challenge.email,
      challenge.mobile,
    );
    const existing =
      this.customers.get(customerId) ??
      (await this.loadPersistedCustomer(customerId));
    if (existing) {
      existing.lastLoginAt = new Date();
      this.customers.set(customerId, existing);
      await this.persistCustomer(existing);
      return { customer: existing, isNewUser: false };
    }

    const now = new Date();
    const customer: CatalogCustomer = {
      customerId,
      email: challenge.email,
      mobile: challenge.mobile,
      name: challenge.email?.split('@')[0] || 'Customer',
      profileComplete: false,
      createdAt: now,
      lastLoginAt: now,
    };
    this.customers.set(customerId, customer);
    await this.persistCustomer(customer);
    return { customer, isNewUser: true };
  }

  private async findOrCreateEmailCustomer(email: string): Promise<{
    customer: CatalogCustomer;
    isNewUser: boolean;
  }> {
    const customerId = this.customerIdForIdentity(email);
    const existing =
      this.customers.get(customerId) ??
      (await this.loadPersistedCustomer(customerId));
    if (existing) {
      existing.lastLoginAt = new Date();
      this.customers.set(customerId, existing);
      await this.persistCustomer(existing);
      return { customer: existing, isNewUser: false };
    }

    const now = new Date();
    const customer: CatalogCustomer = {
      customerId,
      email,
      name: email.split('@')[0],
      profileComplete: false,
      createdAt: now,
      lastLoginAt: now,
    };
    this.customers.set(customerId, customer);
    await this.persistCustomer(customer);
    return { customer, isNewUser: true };
  }

  private getOptionalFirestore(): Firestore | undefined {
    if (
      process.env.CATALOG_AUTH_STORE === 'memory' ||
      process.env.NODE_ENV === 'test'
    ) {
      return undefined;
    }
    const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim();
    if (!databaseId) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'FIRESTORE_DATABASE_ID is required for catalog authentication',
        );
      }
      return undefined;
    }
    this.firestore ??= new Firestore({ databaseId });
    return this.firestore;
  }

  private hashSessionToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async persistSession(
    token: string,
    session: CatalogAccessSession,
  ): Promise<void> {
    const firestore = this.getOptionalFirestore();
    if (!firestore) return;
    await firestore
      .collection('catalog_access_sessions')
      .doc(this.hashSessionToken(token))
      .set({
        customer_id: session.customerId,
        auth_provider: session.authProvider,
        email: session.email ?? null,
        mobile: session.mobile ?? null,
        name: session.name,
        created_ip: session.createdIp,
        user_agent: session.userAgent ?? null,
        expires_at: Timestamp.fromDate(session.expiresAt),
        created_at: Timestamp.now(),
        revoked_at: null,
      });
  }

  private async loadPersistedSession(
    token: string,
  ): Promise<CatalogAccessSession | undefined> {
    const firestore = this.getOptionalFirestore();
    if (!firestore) return undefined;
    const snapshot = await firestore
      .collection('catalog_access_sessions')
      .doc(this.hashSessionToken(token))
      .get();
    const data = snapshot.data();
    if (!snapshot.exists || !data || data.revoked_at) return undefined;
    const session: CatalogAccessSession = {
      customerId: String(data.customer_id),
      authProvider: data.auth_provider as CatalogAuthProvider,
      email: typeof data.email === 'string' ? data.email : undefined,
      mobile: typeof data.mobile === 'string' ? data.mobile : undefined,
      name: String(data.name),
      createdIp: String(data.created_ip ?? ''),
      userAgent:
        typeof data.user_agent === 'string' ? data.user_agent : undefined,
      expiresAt: this.dateFromFirestore(data.expires_at),
    };
    this.sessions.set(token, session);
    return session;
  }

  private async persistCustomer(customer: CatalogCustomer): Promise<void> {
    const firestore = this.getOptionalFirestore();
    if (!firestore) return;
    await firestore
      .collection('catalog_customers')
      .doc(customer.customerId)
      .set(
        {
          email: customer.email ?? null,
          mobile: customer.mobile ?? null,
          name: customer.name,
          profile_complete: customer.profileComplete,
          created_at: Timestamp.fromDate(customer.createdAt),
          last_login_at: Timestamp.fromDate(customer.lastLoginAt),
          updated_at: Timestamp.now(),
        },
        { merge: true },
      );
  }

  private async loadPersistedCustomer(
    customerId: string,
  ): Promise<CatalogCustomer | undefined> {
    const firestore = this.getOptionalFirestore();
    if (!firestore) return undefined;
    const snapshot = await firestore
      .collection('catalog_customers')
      .doc(customerId)
      .get();
    const data = snapshot.data();
    if (!snapshot.exists || !data) return undefined;
    return {
      customerId,
      email: typeof data.email === 'string' ? data.email : undefined,
      mobile: typeof data.mobile === 'string' ? data.mobile : undefined,
      name: String(data.name ?? 'Customer'),
      profileComplete: data.profile_complete === true,
      createdAt: this.dateFromFirestore(data.created_at),
      lastLoginAt: this.dateFromFirestore(data.last_login_at),
    };
  }

  private async listPersistedCustomers(
    firestore: Firestore,
  ): Promise<CatalogCustomer[]> {
    const snapshot = await firestore
      .collection('catalog_customers')
      .orderBy('last_login_at', 'desc')
      .limit(500)
      .get();

    return snapshot.docs.map((document) => {
      const data = document.data();
      return {
        customerId: document.id,
        email: typeof data.email === 'string' ? data.email : undefined,
        mobile: typeof data.mobile === 'string' ? data.mobile : undefined,
        name: String(data.name ?? 'Customer'),
        profileComplete: data.profile_complete === true,
        createdAt: this.dateFromFirestore(data.created_at),
        lastLoginAt: this.dateFromFirestore(data.last_login_at),
      };
    });
  }

  private async persistChallenge(
    challenge: CatalogOtpChallenge,
  ): Promise<void> {
    const firestore = this.getOptionalFirestore();
    if (!firestore) return;
    await firestore
      .collection('catalog_otp_challenges')
      .doc(challenge.challengeId)
      .set({
        channel: challenge.channel,
        contact_key: challenge.contactKey,
        email: challenge.email ?? null,
        mobile: challenge.mobile ?? null,
        hashed_otp: challenge.hashedOtp,
        attempts: challenge.attempts,
        resend_count: challenge.resendCount,
        expires_at: Timestamp.fromDate(challenge.expiresAt),
        locked_at: challenge.lockedAt
          ? Timestamp.fromDate(challenge.lockedAt)
          : null,
        last_sent_at: Timestamp.fromDate(challenge.lastSentAt),
        created_ip: challenge.createdIp,
        user_agent: challenge.userAgent ?? null,
        created_at: Timestamp.fromDate(challenge.createdAt),
      });
  }

  private async loadPersistedChallenge(
    challengeId: string,
  ): Promise<CatalogOtpChallenge | undefined> {
    const firestore = this.getOptionalFirestore();
    if (!firestore) return undefined;
    const snapshot = await firestore
      .collection('catalog_otp_challenges')
      .doc(challengeId)
      .get();
    const data = snapshot.data();
    if (!snapshot.exists || !data) return undefined;
    const challenge: CatalogOtpChallenge = {
      challengeId,
      channel: data.channel as CatalogOtpChannel,
      contactKey: String(data.contact_key),
      email: typeof data.email === 'string' ? data.email : undefined,
      mobile: typeof data.mobile === 'string' ? data.mobile : undefined,
      hashedOtp: String(data.hashed_otp),
      attempts: Number(data.attempts ?? 0),
      resendCount: Number(data.resend_count ?? 0),
      expiresAt: this.dateFromFirestore(data.expires_at),
      lockedAt: data.locked_at
        ? this.dateFromFirestore(data.locked_at)
        : undefined,
      lastSentAt: this.dateFromFirestore(data.last_sent_at),
      createdIp: String(data.created_ip ?? ''),
      userAgent:
        typeof data.user_agent === 'string' ? data.user_agent : undefined,
      createdAt: this.dateFromFirestore(data.created_at),
    };
    this.otpChallenges.set(challengeId, challenge);
    return challenge;
  }

  private async deletePersistedChallenge(challengeId: string): Promise<void> {
    const firestore = this.getOptionalFirestore();
    if (!firestore) return;
    await firestore
      .collection('catalog_otp_challenges')
      .doc(challengeId)
      .delete();
  }

  private async persistEmailLinkChallenge(
    challenge: CatalogEmailLinkChallenge,
  ): Promise<void> {
    const firestore = this.getOptionalFirestore();
    if (!firestore) return;
    await firestore
      .collection('catalog_email_link_challenges')
      .doc(challenge.challengeId)
      .set({
        email: challenge.email,
        hashed_link_token: challenge.hashedLinkToken,
        hashed_claim_token: challenge.hashedClaimToken,
        expires_at: Timestamp.fromDate(challenge.expiresAt),
        created_at: Timestamp.fromDate(challenge.createdAt),
        completed_at: challenge.completedAt
          ? Timestamp.fromDate(challenge.completedAt)
          : null,
        customer_id: challenge.customerId ?? null,
        customer_name: challenge.customerName ?? null,
        is_new_user: challenge.isNewUser ?? null,
        profile_complete: challenge.profileComplete ?? null,
      });
  }

  private async loadPersistedEmailLinkChallenge(
    challengeId: string,
  ): Promise<CatalogEmailLinkChallenge | undefined> {
    const firestore = this.getOptionalFirestore();
    if (!firestore) return undefined;
    const snapshot = await firestore
      .collection('catalog_email_link_challenges')
      .doc(challengeId)
      .get();
    const data = snapshot.data();
    if (!snapshot.exists || !data) return undefined;
    const challenge: CatalogEmailLinkChallenge = {
      challengeId,
      email: String(data.email),
      hashedLinkToken: String(data.hashed_link_token),
      hashedClaimToken: String(data.hashed_claim_token),
      expiresAt: this.dateFromFirestore(data.expires_at),
      createdAt: this.dateFromFirestore(data.created_at),
      completedAt: data.completed_at
        ? this.dateFromFirestore(data.completed_at)
        : undefined,
      customerId:
        typeof data.customer_id === 'string' ? data.customer_id : undefined,
      customerName:
        typeof data.customer_name === 'string' ? data.customer_name : undefined,
      isNewUser:
        typeof data.is_new_user === 'boolean' ? data.is_new_user : undefined,
      profileComplete:
        typeof data.profile_complete === 'boolean'
          ? data.profile_complete
          : undefined,
    };
    this.emailLinkChallenges.set(challengeId, challenge);
    return challenge;
  }

  private dateFromFirestore(value: unknown): Date {
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    return new Date(String(value));
  }

  private async verifyDeliveredOtp(
    challenge: CatalogOtpChallenge,
    code: string,
  ): Promise<boolean> {
    if (this.getOtpProvider() === 'twilio') {
      return this.verifyTwilioOtp(challenge, code);
    }
    return this.isOtpMatch(challenge, code);
  }

  private async sendOtp(
    challenge: CatalogOtpChallenge,
    otp: string,
  ): Promise<void> {
    if (this.isOtpDeliveryDisabled()) {
      throw new ServiceUnavailableException(
        'Catalog OTP delivery is not enabled',
      );
    }

    if (this.getOtpProvider() === 'twilio') {
      await this.sendTwilioOtp(challenge);
      return;
    }

    if (challenge.channel === 'email') {
      await this.sendEmailOtp(challenge.email!, otp);
      return;
    }

    this.logger.log(
      `Development catalog SMS OTP for ${challenge.mobile}: ${otp}`,
    );
  }

  private async sendTwilioOtp(challenge: CatalogOtpChallenge): Promise<void> {
    const serviceSid = this.getRequiredEnv('TWILIO_VERIFY_SERVICE_SID');
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/Verifications`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${this.getTwilioBasicAuth()}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: challenge.email ?? challenge.mobile ?? '',
          Channel: challenge.channel,
        }),
      },
    );
    await this.assertOkResponse(response, 'OTP delivery failed');
  }

  private async verifyTwilioOtp(
    challenge: CatalogOtpChallenge,
    code: string,
  ): Promise<boolean> {
    const serviceSid = this.getRequiredEnv('TWILIO_VERIFY_SERVICE_SID');
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/VerificationCheck`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${this.getTwilioBasicAuth()}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: challenge.email ?? challenge.mobile ?? '',
          Code: code,
        }),
      },
    );
    if (response.status >= 500) {
      throw new ServiceUnavailableException(
        'OTP verification is temporarily unavailable',
      );
    }
    if (!response.ok) return false;
    const result = (await response.json()) as { status?: string };
    return result.status === 'approved';
  }

  private getTwilioBasicAuth(): string {
    const accountSid = this.getRequiredEnv('TWILIO_ACCOUNT_SID');
    const authToken = this.getRequiredEnv('TWILIO_AUTH_TOKEN');
    return Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  }

  private async sendEmailOtp(email: string, otp: string): Promise<void> {
    const provider = this.getEmailProvider();

    if (provider === 'ses') {
      await this.sendSesOtp(email, otp);
      return;
    }

    if (provider === 'zeptomail') {
      await this.sendZeptoMailOtp(email, otp);
      return;
    }

    this.logger.log(`Development catalog email OTP for ${email}: ${otp}`);
  }

  private async sendSesOtp(email: string, otp: string): Promise<void> {
    const fromEmail = this.getRequiredEnv('CATALOG_EMAIL_FROM');
    const client = new SESv2Client({
      region: process.env.AWS_REGION ?? process.env.AWS_SES_REGION,
    });

    await client.send(
      new SendEmailCommand({
        FromEmailAddress: fromEmail,
        Destination: {
          ToAddresses: [email],
        },
        Content: {
          Simple: {
            Subject: {
              Data: 'Your catalog access code',
            },
            Body: {
              Text: {
                Data: `Your catalog access code is ${otp}. It expires in ${Math.floor(
                  this.getOtpTtlSeconds() / 60,
                )} minutes.`,
              },
              Html: {
                Data: `<p>Your catalog access code is <strong>${otp}</strong>.</p><p>It expires in ${Math.floor(
                  this.getOtpTtlSeconds() / 60,
                )} minutes.</p>`,
              },
            },
          },
        },
      }),
    );
  }

  private async sendZeptoMailOtp(email: string, otp: string): Promise<void> {
    const token = this.getRequiredEnv('CATALOG_ZEPTOMAIL_TOKEN');
    const fromEmail = this.getRequiredEnv('CATALOG_EMAIL_FROM');
    const response = await fetch(
      process.env.CATALOG_ZEPTOMAIL_API_URL ??
        'https://api.zeptomail.com/v1.1/email',
      {
        method: 'POST',
        headers: {
          Authorization: token.startsWith('Zoho-enczapikey ')
            ? token
            : `Zoho-enczapikey ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: {
            address: fromEmail,
            name: process.env.CATALOG_EMAIL_FROM_NAME ?? 'Catalog Access',
          },
          to: [
            {
              email_address: {
                address: email,
              },
            },
          ],
          subject: 'Your catalog access code',
          textbody: `Your catalog access code is ${otp}. It expires in ${Math.floor(
            this.getOtpTtlSeconds() / 60,
          )} minutes.`,
          htmlbody: `<p>Your catalog access code is <strong>${otp}</strong>.</p><p>It expires in ${Math.floor(
            this.getOtpTtlSeconds() / 60,
          )} minutes.</p>`,
        }),
      },
    );

    await this.assertOkResponse(response, 'ZeptoMail OTP delivery failed');
  }

  private async sendWhatsappOtp(mobile: string, otp: string): Promise<void> {
    const provider = this.getWhatsappProvider();

    if (provider === 'meta') {
      await this.sendMetaWhatsappOtp(mobile, otp);
      return;
    }

    if (provider === 'http') {
      await this.sendHttpWhatsappOtp(mobile, otp);
      return;
    }

    this.logger.log(`Development catalog WhatsApp OTP for ${mobile}: ${otp}`);
  }

  private async sendMetaWhatsappOtp(
    mobile: string,
    otp: string,
  ): Promise<void> {
    const phoneNumberId = this.getRequiredEnv(
      'CATALOG_WHATSAPP_META_PHONE_NUMBER_ID',
    );
    const accessToken = this.getRequiredEnv(
      'CATALOG_WHATSAPP_META_ACCESS_TOKEN',
    );
    const templateName = this.getRequiredEnv('CATALOG_WHATSAPP_TEMPLATE_NAME');
    const languageCode =
      process.env.CATALOG_WHATSAPP_TEMPLATE_LANGUAGE ?? 'en_US';
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: this.normalizeWhatsappMobile(mobile),
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: languageCode,
            },
            components: [
              {
                type: 'body',
                parameters: [
                  {
                    type: 'text',
                    text: otp,
                  },
                ],
              },
            ],
          },
        }),
      },
    );

    await this.assertOkResponse(response, 'WhatsApp OTP delivery failed');
  }

  private async sendHttpWhatsappOtp(
    mobile: string,
    otp: string,
  ): Promise<void> {
    const url = this.getRequiredEnv('CATALOG_WHATSAPP_HTTP_URL');
    const bodyTemplate = this.getRequiredEnv('CATALOG_WHATSAPP_HTTP_BODY');
    const authHeader = process.env.CATALOG_WHATSAPP_HTTP_AUTH_HEADER;
    const authValue = process.env.CATALOG_WHATSAPP_HTTP_AUTH_VALUE;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authHeader && authValue) {
      headers[authHeader] = authValue;
    }

    const response = await fetch(url, {
      method: process.env.CATALOG_WHATSAPP_HTTP_METHOD ?? 'POST',
      headers,
      body: this.renderTemplate(bodyTemplate, mobile, otp),
    });

    await this.assertOkResponse(response, 'WhatsApp OTP delivery failed');
  }

  private async assertOkResponse(
    response: Response,
    message: string,
  ): Promise<void> {
    if (response.ok) {
      return;
    }

    const body = await response.text().catch(() => '');
    throw new ServiceUnavailableException(`${message}: ${response.status}`, {
      cause: body,
    });
  }

  private renderTemplate(
    template: string,
    mobile: string,
    otp: string,
  ): string {
    return template
      .replaceAll('{{mobile}}', mobile)
      .replaceAll('{{mobile_e164}}', this.normalizeWhatsappMobile(mobile))
      .replaceAll('{{otp}}', otp)
      .replaceAll(
        '{{template_name}}',
        process.env.CATALOG_WHATSAPP_TEMPLATE_NAME ?? '',
      )
      .replaceAll(
        '{{language}}',
        process.env.CATALOG_WHATSAPP_TEMPLATE_LANGUAGE ?? 'en_US',
      );
  }

  private normalizeWhatsappMobile(mobile: string): string {
    const trimmed = mobile.trim();

    if (trimmed.startsWith('+')) {
      return trimmed.slice(1);
    }

    return trimmed;
  }

  private audit(
    inquiry: Partial<CatalogInquiry>,
    context: CatalogAccessRequestContext,
    status: string,
    authProvider?: CatalogAuthProvider,
    channel?: CatalogOtpChannel,
  ): void {
    this.auditRecords.push({
      name: inquiry.name,
      mobile: inquiry.mobile,
      email: inquiry.email,
      message: inquiry.message,
      authProvider,
      channel,
      ip: context.ip,
      userAgent: context.userAgent,
      status,
      createdAt: new Date().toISOString(),
    });

    if (this.auditRecords.length > 1000) {
      this.auditRecords.shift();
    }
  }

  private getOtpAuthProvider(channel: CatalogOtpChannel): CatalogAuthProvider {
    return channel === 'email' ? 'email_otp' : 'sms_otp';
  }

  private getOtpProvider(): 'twilio' | 'local' {
    const provider = process.env.CATALOG_OTP_PROVIDER?.trim().toLowerCase();
    if (provider === 'twilio') return 'twilio';
    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException(
        'CATALOG_OTP_PROVIDER=twilio is required',
      );
    }
    return 'local';
  }

  private getGoogleClientIds(): string[] {
    return (process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID ?? '')
      .split(',')
      .map((clientId) => clientId.trim())
      .filter(Boolean);
  }

  private getEmailProvider(): 'ses' | 'zeptomail' | 'log' {
    const provider = process.env.CATALOG_EMAIL_OTP_PROVIDER?.trim();

    if (provider === 'ses' || provider === 'zeptomail') {
      return provider;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException(
        'Email OTP provider is not configured',
      );
    }

    return 'log';
  }

  private getWhatsappProvider(): 'meta' | 'http' | 'log' {
    const provider = process.env.CATALOG_WHATSAPP_OTP_PROVIDER?.trim();

    if (provider === 'meta' || provider === 'http') {
      return provider;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException(
        'WhatsApp OTP provider is not configured',
      );
    }

    return 'log';
  }

  private isOtpDeliveryDisabled(): boolean {
    return process.env.CATALOG_OTP_DELIVERY_ENABLED !== 'true';
  }

  private getOtpTtlSeconds(): number {
    return this.getPositiveIntegerEnv('CATALOG_OTP_TTL_SECONDS', 10 * 60);
  }

  private getOtpResendAfterSeconds(): number {
    return this.getPositiveIntegerEnv('CATALOG_OTP_RESEND_AFTER_SECONDS', 60);
  }

  private getOtpMaxAttempts(): number {
    return this.getPositiveIntegerEnv('CATALOG_OTP_MAX_ATTEMPTS', 5);
  }

  private getSessionTtlSeconds(): number {
    return this.getPositiveIntegerEnv(
      'CATALOG_ACCESS_TTL_SECONDS',
      180 * 24 * 60 * 60,
    );
  }

  private getPositiveIntegerEnv(name: string, fallback: number): number {
    const value = Number(process.env[name]);

    if (!Number.isFinite(value) || value <= 0) {
      return fallback;
    }

    return Math.floor(value);
  }

  private getRequiredEnv(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
      throw new ServiceUnavailableException(`${name} is not configured`);
    }

    return value;
  }
}
