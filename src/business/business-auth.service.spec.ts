import { ForbiddenException } from '@nestjs/common';
import type { LoginTicket, TokenPayload } from 'google-auth-library';
import { OAuth2Client } from 'google-auth-library';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthService } from './business-auth.service';
import { BusinessAuthStore } from './business-auth.store';
import type {
  BusinessUser,
  StoredBusinessSession,
} from './business-auth.types';
import { EnvBusinessAuthorizationProvider } from './business-authorization.provider';

describe('BusinessAuthService', () => {
  const originalEnvironment = {
    clientId: process.env.BUSINESS_UI_GOOGLE_CLIENT_ID,
    emails: process.env.BUSINESS_UI_ALLOWED_GOOGLE_EMAILS,
    csrf: process.env.BUSINESS_UI_CSRF_SECRET,
  };
  const user: BusinessUser = {
    email: 'allowed@gmail.com',
    name: 'Allowed User',
    role: 'business_admin',
    status: 'active',
    subject: 'google-subject',
  };
  const store = {
    bindUser: jest.fn(),
    createSession: jest.fn(),
    getSession: jest.fn(),
    getUser: jest.fn(),
    listActiveSessions: jest.fn(),
    revokeSession: jest.fn(),
    revokeSessionsForSubject: jest.fn(),
    updateSession: jest.fn(),
  };
  const audit = {
    record: jest.fn(),
  };
  let service: BusinessAuthService;
  let verifyIdToken: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BUSINESS_UI_GOOGLE_CLIENT_ID = 'business-client-id';
    process.env.BUSINESS_UI_ALLOWED_GOOGLE_EMAILS = 'allowed@gmail.com';
    process.env.BUSINESS_UI_CSRF_SECRET =
      'a-test-secret-with-at-least-thirty-two-characters';
    store.bindUser.mockResolvedValue(user);
    store.createSession.mockResolvedValue(undefined);
    store.listActiveSessions.mockResolvedValue([]);
    store.getUser.mockResolvedValue(user);
    store.revokeSession.mockResolvedValue(undefined);
    store.revokeSessionsForSubject.mockResolvedValue(undefined);
    store.updateSession.mockResolvedValue(undefined);

    service = new BusinessAuthService(
      store as unknown as BusinessAuthStore,
      new EnvBusinessAuthorizationProvider(),
      audit as unknown as SecurityAuditService,
    );
    verifyIdToken = jest
      .spyOn(OAuth2Client.prototype, 'verifyIdToken')
      .mockResolvedValue(createTicket('allowed@gmail.com'));
  });

  afterEach(() => {
    verifyIdToken.mockRestore();
  });

  afterAll(() => {
    restoreEnvironment(
      'BUSINESS_UI_GOOGLE_CLIENT_ID',
      originalEnvironment.clientId,
    );
    restoreEnvironment(
      'BUSINESS_UI_ALLOWED_GOOGLE_EMAILS',
      originalEnvironment.emails,
    );
    restoreEnvironment('BUSINESS_UI_CSRF_SECRET', originalEnvironment.csrf);
  });

  it('creates a hashed persistent session for an allowed Google subject', async () => {
    const grant = await service.authenticateWithGoogle('google-id-token', {
      ip: '127.0.0.1',
    });

    expect(grant.user).toEqual(user);
    expect(typeof grant.csrfToken).toBe('string');
    expect(typeof grant.token).toBe('string');
    expect(grant.token).toHaveLength(43);
    expect(store.bindUser).toHaveBeenCalledWith({
      email: 'allowed@gmail.com',
      hostedDomain: undefined,
      name: 'Allowed User',
      subject: 'google-subject',
    });
    expect(store.createSession).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.objectContaining({
        email: 'allowed@gmail.com',
        subject: 'google-subject',
      }),
    );
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'google-id-token',
      audience: 'business-client-id',
    });
  });

  it('rejects a verified Google account that is not allowed', async () => {
    verifyIdToken.mockResolvedValue(createTicket('blocked@gmail.com'));

    await expect(
      service.authenticateWithGoogle('google-id-token', {
        ip: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.bindUser).not.toHaveBeenCalled();
  });

  it('rejects an allowlisted Google account whose backend user is disabled', async () => {
    store.bindUser.mockResolvedValue({
      ...user,
      status: 'disabled',
    });

    await expect(
      service.authenticateWithGoogle('google-id-token', {
        ip: '127.0.0.1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.createSession).not.toHaveBeenCalled();
  });

  it('immediately revokes sessions when an email leaves the allowlist', async () => {
    const session = createStoredSession();
    store.getSession.mockResolvedValue(session);
    process.env.BUSINESS_UI_ALLOWED_GOOGLE_EMAILS = 'other@gmail.com';

    await expect(
      service.restoreSession('opaque-session-token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.revokeSessionsForSubject).toHaveBeenCalledWith(
      'google-subject',
    );
  });

  it('accepts only the CSRF token derived from the opaque session token', () => {
    const grantCsrf = (
      service as unknown as {
        createCsrfToken(token: string): string;
      }
    ).createCsrfToken('opaque-session-token');

    expect(() =>
      service.validateCsrf('opaque-session-token', grantCsrf),
    ).not.toThrow();
    expect(() =>
      service.validateCsrf('opaque-session-token', 'wrong-token'),
    ).toThrow(ForbiddenException);
  });
});

function createTicket(email: string): LoginTicket {
  const payload = {
    email,
    email_verified: true,
    name: 'Allowed User',
    sub: 'google-subject',
  } as TokenPayload;

  return {
    getPayload: () => payload,
  } as LoginTicket;
}

function createStoredSession(): StoredBusinessSession {
  const now = Date.now();

  return {
    createdAt: new Date(now - 60_000),
    email: 'allowed@gmail.com',
    expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
    idleExpiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
    lastSeenAt: new Date(now),
    name: 'Allowed User',
    role: 'business_admin',
    rotateAfter: new Date(now + 24 * 60 * 60 * 1000),
    subject: 'google-subject',
  };
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
