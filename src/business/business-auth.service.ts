import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthStore } from './business-auth.store';
import type {
  AuthenticatedBusinessSession,
  BusinessIdentity,
  BusinessRequestContext,
  BusinessUser,
  StoredBusinessSession,
} from './business-auth.types';
import { EnvBusinessAuthorizationProvider } from './business-authorization.provider';

const absoluteSessionMs = 30 * 24 * 60 * 60 * 1000;
const idleSessionMs = 7 * 24 * 60 * 60 * 1000;
const rotationMs = 24 * 60 * 60 * 1000;
const touchIntervalMs = 5 * 60 * 1000;
const maxSessionsPerUser = 5;

export interface BusinessAuthGrant {
  csrfToken: string;
  rotated: boolean;
  session: AuthenticatedBusinessSession;
  token: string;
  user: BusinessUser;
}

@Injectable()
export class BusinessAuthService {
  private readonly googleOAuthClient = new OAuth2Client();

  constructor(
    private readonly store: BusinessAuthStore,
    private readonly authorization: EnvBusinessAuthorizationProvider,
    private readonly audit: SecurityAuditService,
  ) {}

  async authenticateWithGoogle(
    idToken: string,
    context: BusinessRequestContext,
  ): Promise<BusinessAuthGrant> {
    const identity = await this.verifyGoogleIdentity(idToken, context);

    try {
      this.authorization.authorizeIdentity(identity);
    } catch (error) {
      this.audit.record({
        action: 'business_login',
        outcome: 'denied',
        email: identity.email,
        subject: identity.subject,
        ip: context.ip,
        reason: error instanceof Error ? error.message : 'not_authorized',
      });
      throw error;
    }

    const user = await this.store.bindUser(identity);

    if (user.status !== 'active') {
      throw new ForbiddenException('Account is disabled');
    }

    await this.enforceSessionLimit(user.subject);
    const grant = await this.createSession(user);
    this.audit.record({
      action: 'business_login',
      outcome: 'allowed',
      email: user.email,
      subject: user.subject,
      ip: context.ip,
    });
    return grant;
  }

  async restoreSession(
    token: string | undefined,
    rotate = false,
  ): Promise<BusinessAuthGrant> {
    if (!token) {
      throw new UnauthorizedException('Business authentication is required');
    }

    const tokenHash = this.hashToken(token);
    const session = await this.store.getSession(tokenHash);
    const now = new Date();

    if (!session) {
      throw new UnauthorizedException('Business authentication is required');
    }

    if (
      session.revokedAt &&
      (!session.graceExpiresAt || session.graceExpiresAt <= now)
    ) {
      throw new UnauthorizedException('Business session was revoked');
    }

    if (session.expiresAt <= now || session.idleExpiresAt <= now) {
      await this.store.revokeSession(tokenHash);
      throw new UnauthorizedException('Business session has expired');
    }

    const user = await this.store.getUser(session.subject);
    const authorized =
      user?.status === 'active' &&
      user.email === session.email &&
      this.authorization.isSessionAuthorized(session.subject, session.email);

    if (!authorized || !user) {
      await this.store.revokeSessionsForSubject(session.subject);
      throw new ForbiddenException('Account is not authorized');
    }

    if (rotate && session.rotateAfter <= now) {
      return this.rotateSession(tokenHash, session, user);
    }

    if (now.getTime() - session.lastSeenAt.getTime() >= touchIntervalMs) {
      session.lastSeenAt = now;
      session.idleExpiresAt = new Date(now.getTime() + idleSessionMs);
      await this.store.updateSession(tokenHash, {
        lastSeenAt: session.lastSeenAt,
        idleExpiresAt: session.idleExpiresAt,
      });
    }

    return {
      csrfToken: this.createCsrfToken(token),
      rotated: false,
      session: { ...session, tokenHash },
      token,
      user,
    };
  }

  async revokeSession(token: string | undefined): Promise<void> {
    if (token) {
      await this.store.revokeSession(this.hashToken(token));
    }
  }

  validateCsrf(
    token: string | undefined,
    suppliedCsrf: string | undefined,
  ): void {
    if (!token || !suppliedCsrf) {
      throw new ForbiddenException('CSRF token is required');
    }

    const expected = Buffer.from(this.createCsrfToken(token));
    const supplied = Buffer.from(suppliedCsrf);

    if (
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied)
    ) {
      throw new ForbiddenException('CSRF token is invalid');
    }
  }

  private async verifyGoogleIdentity(
    idToken: string,
    context: BusinessRequestContext,
  ): Promise<BusinessIdentity> {
    const clientIds = this.getGoogleClientIds();

    if (clientIds.length === 0) {
      throw new ServiceUnavailableException(
        'Business Google sign-in is not configured',
      );
    }

    let payload: TokenPayload | undefined;

    try {
      const ticket = await this.googleOAuthClient.verifyIdToken({
        idToken,
        audience: clientIds.length === 1 ? clientIds[0] : clientIds,
      });
      payload = ticket.getPayload();
    } catch (error) {
      this.audit.record({
        action: 'business_login',
        outcome: 'failed',
        ip: context.ip,
        reason: 'invalid_google_token',
      });
      throw new UnauthorizedException('Invalid Google sign-in token', {
        cause: error,
      });
    }

    const email = payload?.email?.trim().toLowerCase();
    const subject = payload?.sub?.trim();

    if (!payload || !email || !subject || payload.email_verified !== true) {
      throw new UnauthorizedException('Verified Google identity is required');
    }

    return {
      email,
      hostedDomain: payload.hd?.trim(),
      name: payload.name?.trim() || email,
      subject,
    };
  }

  private async createSession(user: BusinessUser): Promise<BusinessAuthGrant> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const session: StoredBusinessSession = {
      createdAt: now,
      email: user.email,
      expiresAt: new Date(now.getTime() + absoluteSessionMs),
      idleExpiresAt: new Date(now.getTime() + idleSessionMs),
      lastSeenAt: now,
      name: user.name,
      role: user.role,
      rotateAfter: new Date(now.getTime() + rotationMs),
      subject: user.subject,
    };

    await this.store.createSession(tokenHash, session);
    return {
      csrfToken: this.createCsrfToken(token),
      rotated: false,
      session: { ...session, tokenHash },
      token,
      user,
    };
  }

  private async rotateSession(
    previousHash: string,
    previous: StoredBusinessSession,
    user: BusinessUser,
  ): Promise<BusinessAuthGrant> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const session: StoredBusinessSession = {
      ...previous,
      idleExpiresAt: new Date(now.getTime() + idleSessionMs),
      lastSeenAt: now,
      name: user.name,
      rotateAfter: new Date(now.getTime() + rotationMs),
    };

    delete session.revokedAt;
    delete session.graceExpiresAt;
    delete session.replacedByHash;
    await this.store.createSession(tokenHash, session);
    await this.store.revokeSession(previousHash, tokenHash);
    return {
      csrfToken: this.createCsrfToken(token),
      rotated: true,
      session: { ...session, tokenHash },
      token,
      user,
    };
  }

  private async enforceSessionLimit(subject: string): Promise<void> {
    const sessions = await this.store.listActiveSessions(subject);
    const sessionsToRevoke = sessions.slice(
      0,
      Math.max(0, sessions.length - maxSessionsPerUser + 1),
    );

    await Promise.all(
      sessionsToRevoke.map(({ tokenHash }) =>
        this.store.revokeSession(tokenHash),
      ),
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private createCsrfToken(token: string): string {
    const secret = process.env.BUSINESS_UI_CSRF_SECRET?.trim();

    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException(
        'BUSINESS_UI_CSRF_SECRET must contain at least 32 characters',
      );
    }

    return createHmac('sha256', secret).update(token).digest('base64url');
  }

  private getGoogleClientIds(): string[] {
    return (
      process.env.BUSINESS_UI_GOOGLE_CLIENT_ID ??
      process.env.GOOGLE_CLIENT_ID ??
      ''
    )
      .split(',')
      .map((clientId) => clientId.trim())
      .filter(Boolean);
  }
}
