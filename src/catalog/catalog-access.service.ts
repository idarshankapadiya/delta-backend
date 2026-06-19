import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { OAuth2Client } from 'google-auth-library';
import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { ulid } from 'ulid';

const DEFAULT_CATALOG_MASTER_OTP = '190399';

type CatalogOtpChannel = 'whatsapp' | 'email';
type CatalogAuthProvider = 'google' | 'whatsapp_otp' | 'email_otp';

interface CatalogInquiry {
  name: string;
  mobile?: string;
  email?: string;
  message?: string;
}

interface CatalogOtpRequest extends CatalogInquiry {
  channel: CatalogOtpChannel;
  otp?: string;
}

interface CatalogAccessRequestContext {
  ip: string;
  userAgent?: string;
}

interface CatalogAccessSession {
  expiresAt: Date;
  name: string;
  mobile?: string;
  email?: string;
  authProvider: CatalogAuthProvider;
  createdIp: string;
  userAgent?: string;
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
  inquiry: CatalogOtpRequest;
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
}

@Injectable()
export class CatalogAccessService {
  private readonly logger = new Logger(CatalogAccessService.name);
  private readonly googleOAuthClient = new OAuth2Client();
  private readonly sessions = new Map<string, CatalogAccessSession>();
  private readonly otpChallenges = new Map<string, CatalogOtpChallenge>();
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
      const session = this.createSession(
        {
          name,
          email,
          authProvider: 'google',
        },
        context,
      );

      this.audit({ name, email }, context, 'google_verified', 'google');

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

  async requestOtp(
    inquiry: CatalogOtpRequest,
    context: CatalogAccessRequestContext,
  ) {
    const channel = inquiry.channel;
    const contactKey = this.getOtpContactKey(inquiry);
    const challengeId = ulid();
    const otp = this.createOtp();
    const expiresAt = new Date(Date.now() + this.getOtpTtlSeconds() * 1000);
    const challenge: CatalogOtpChallenge = {
      challengeId,
      channel,
      contactKey,
      mobile: inquiry.mobile?.trim(),
      email: inquiry.email?.trim().toLowerCase(),
      hashedOtp: this.hashOtp(challengeId, contactKey, otp),
      attempts: 0,
      resendCount: 0,
      expiresAt,
      inquiry: {
        ...inquiry,
        mobile: inquiry.mobile?.trim(),
        email: inquiry.email?.trim().toLowerCase(),
      },
      createdIp: context.ip,
      userAgent: context.userAgent,
      createdAt: new Date(),
    };

    this.otpChallenges.set(challengeId, challenge);

    try {
      await this.sendOtp(challenge, otp);
      this.audit(
        inquiry,
        context,
        'otp_requested',
        this.getOtpAuthProvider(channel),
        channel,
      );
    } catch (error) {
      this.otpChallenges.delete(challengeId);
      this.audit(
        inquiry,
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
      expires_at: expiresAt.toISOString(),
      resend_after_seconds: this.getOtpResendAfterSeconds(),
    };
  }

  createMasterOtpAccess(
    inquiry: CatalogOtpRequest,
    context: CatalogAccessRequestContext,
  ): CatalogSessionGrant {
    if (!inquiry.otp || !this.isMasterOtp(inquiry.otp)) {
      this.audit(
        inquiry,
        context,
        'master_otp_verification_failed',
        this.getOtpAuthProvider(inquiry.channel),
        inquiry.channel,
      );
      throw new UnauthorizedException('Invalid OTP');
    }

    this.getOtpContactKey(inquiry);

    const authProvider = this.getOtpAuthProvider(inquiry.channel);
    const session = this.createSession(
      {
        name: inquiry.name,
        mobile: inquiry.mobile?.trim(),
        email: inquiry.email?.trim().toLowerCase(),
        authProvider,
      },
      context,
    );

    this.audit(
      inquiry,
      context,
      'master_otp_verified',
      authProvider,
      inquiry.channel,
    );

    return {
      ...session,
      name: inquiry.name,
      mobile: inquiry.mobile?.trim(),
      email: inquiry.email?.trim().toLowerCase(),
    };
  }

  verifyOtp(
    input: {
      challenge_id: string;
      mobile?: string;
      email?: string;
      otp: string;
    },
    context: CatalogAccessRequestContext,
  ): CatalogSessionGrant {
    const challenge = this.otpChallenges.get(input.challenge_id);

    if (!challenge || !this.isOtpChallengeContactMatch(challenge, input)) {
      this.audit(input, context, 'otp_invalid_challenge');
      throw new BadRequestException('Invalid OTP challenge');
    }

    if (challenge.lockedAt) {
      this.audit(
        challenge.inquiry,
        context,
        'otp_challenge_locked',
        this.getOtpAuthProvider(challenge.channel),
        challenge.channel,
      );
      throw new UnauthorizedException('OTP challenge is locked');
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      this.otpChallenges.delete(challenge.challengeId);
      this.audit(
        challenge.inquiry,
        context,
        'otp_challenge_expired',
        this.getOtpAuthProvider(challenge.channel),
        challenge.channel,
      );
      throw new UnauthorizedException('OTP challenge has expired');
    }

    if (!this.isOtpMatch(challenge, input.otp)) {
      challenge.attempts += 1;

      if (challenge.attempts >= this.getOtpMaxAttempts()) {
        challenge.lockedAt = new Date();
        this.audit(
          challenge.inquiry,
          context,
          'otp_challenge_locked',
          this.getOtpAuthProvider(challenge.channel),
          challenge.channel,
        );
        throw new UnauthorizedException('OTP challenge is locked');
      }

      this.audit(
        challenge.inquiry,
        context,
        'otp_verification_failed',
        this.getOtpAuthProvider(challenge.channel),
        challenge.channel,
      );
      throw new UnauthorizedException('Invalid OTP');
    }

    const authProvider = this.getOtpAuthProvider(challenge.channel);
    const session = this.createSession(
      {
        name: challenge.inquiry.name,
        mobile: challenge.mobile,
        email: challenge.email,
        authProvider,
      },
      context,
    );

    this.otpChallenges.delete(challenge.challengeId);
    this.audit(
      challenge.inquiry,
      context,
      'otp_verified',
      authProvider,
      challenge.channel,
    );

    return {
      ...session,
      name: challenge.inquiry.name,
      mobile: challenge.mobile,
      email: challenge.email,
    };
  }

  validateAccessToken(token: string): boolean {
    const session = this.sessions.get(token);

    if (!session) {
      return false;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      this.sessions.delete(token);
      return false;
    }

    return true;
  }

  private createSession(
    input: {
      name: string;
      mobile?: string;
      email?: string;
      authProvider: CatalogAuthProvider;
    },
    context: CatalogAccessRequestContext,
  ): CatalogSessionGrant {
    const token = this.createAccessToken();
    const expiresAt = new Date(Date.now() + this.getSessionTtlSeconds() * 1000);

    this.sessions.set(token, {
      expiresAt,
      name: input.name,
      mobile: input.mobile,
      email: input.email,
      authProvider: input.authProvider,
      createdIp: context.ip,
      userAgent: context.userAgent,
    });

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
    const configuredOtp =
      process.env.CATALOG_MASTER_OTP_CODE?.trim() ??
      process.env.CATALOG_DEV_OTP_CODE?.trim();

    if (configuredOtp) {
      return configuredOtp;
    }

    if (this.isOtpDeliveryDisabled()) {
      return DEFAULT_CATALOG_MASTER_OTP;
    }

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
    if (this.isMasterOtp(otp)) {
      return true;
    }

    const expected = Buffer.from(challenge.hashedOtp, 'hex');
    const actual = Buffer.from(
      this.hashOtp(challenge.challengeId, challenge.contactKey, otp.trim()),
      'hex',
    );

    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  private isOtpChallengeContactMatch(
    challenge: CatalogOtpChallenge,
    input: { mobile?: string; email?: string },
  ): boolean {
    if (challenge.channel === 'email') {
      return (
        !input.email ||
        input.email.trim().toLowerCase() === challenge.email?.toLowerCase()
      );
    }

    return !input.mobile || input.mobile.trim() === challenge.mobile;
  }

  private getOtpContactKey(inquiry: CatalogOtpRequest): string {
    if (inquiry.channel === 'email') {
      const email = inquiry.email?.trim().toLowerCase();

      if (!email) {
        throw new BadRequestException('email is required for email OTP');
      }

      return `email:${email}`;
    }

    const mobile = inquiry.mobile?.trim();

    if (!mobile) {
      throw new BadRequestException('mobile is required for WhatsApp OTP');
    }

    return `whatsapp:${mobile}`;
  }

  private async sendOtp(
    challenge: CatalogOtpChallenge,
    otp: string,
  ): Promise<void> {
    if (this.isOtpDeliveryDisabled()) {
      this.logger.log(
        `Catalog OTP delivery disabled for ${challenge.contactKey}; master OTP is active`,
      );
      return;
    }

    if (challenge.channel === 'email') {
      await this.sendEmailOtp(challenge.email!, otp);
      return;
    }

    await this.sendWhatsappOtp(challenge.mobile!, otp);
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
    return channel === 'email' ? 'email_otp' : 'whatsapp_otp';
  }

  private getGoogleClientIds(): string[] {
    return (
      process.env.CATALOG_GOOGLE_CLIENT_ID ??
      process.env.GOOGLE_CLIENT_ID ??
      ''
    )
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

  private isMasterOtp(otp: string): boolean {
    return otp.trim() === this.getMasterOtp();
  }

  private getMasterOtp(): string {
    return (
      process.env.CATALOG_MASTER_OTP_CODE?.trim() ?? DEFAULT_CATALOG_MASTER_OTP
    );
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
