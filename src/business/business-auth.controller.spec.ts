import type { FastifyReply, FastifyRequest } from 'fastify';
import { BusinessAuthController } from './business-auth.controller';
import type { BusinessAuthGrant } from './business-auth.service';
import { BusinessAuthService } from './business-auth.service';

describe('BusinessAuthController', () => {
  const service = {
    authenticateWithGoogle: jest.fn(),
    restoreSession: jest.fn(),
    revokeSession: jest.fn(),
  };
  const controller = new BusinessAuthController(
    service as unknown as BusinessAuthService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets an HttpOnly business session cookie after Google login', async () => {
    service.authenticateWithGoogle.mockResolvedValue(createGrant());
    const reply = createReply();

    await expect(
      controller.authenticateWithGoogle(
        { id_token: 'google-id-token' },
        createRequest(),
        reply as unknown as FastifyReply,
      ),
    ).resolves.toMatchObject({
      ok: true,
      authorized: true,
      csrf_token: 'csrf-token',
      email: 'allowed@gmail.com',
      subject: 'google-subject',
    });

    expect(reply.setCookie).toHaveBeenCalledWith(
      'business_session',
      'business-session-token',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
  });

  it('restores and revokes a business session from its cookie', async () => {
    service.restoreSession.mockResolvedValue(createGrant());
    const request = createRequest('business-session-token');
    const restoreReply = createReply();

    await expect(
      controller.getCurrentUser(
        request,
        restoreReply as unknown as FastifyReply,
      ),
    ).resolves.toMatchObject({
      authorized: true,
      email: 'allowed@gmail.com',
    });
    expect(service.restoreSession).toHaveBeenCalledWith(
      'business-session-token',
      true,
    );

    const logoutReply = createReply();
    await expect(
      controller.logout(request, logoutReply as unknown as FastifyReply),
    ).resolves.toEqual({ ok: true });
    expect(service.revokeSession).toHaveBeenCalledWith(
      'business-session-token',
    );
    expect(logoutReply.clearCookie).toHaveBeenCalledWith(
      'business_session',
      expect.objectContaining({ path: '/' }),
    );
  });
});

function createGrant(): BusinessAuthGrant {
  const now = new Date('2026-07-03T00:00:00.000Z');
  const expiresAt = new Date('2026-08-02T00:00:00.000Z');
  const idleExpiresAt = new Date('2026-07-10T00:00:00.000Z');

  return {
    csrfToken: 'csrf-token',
    rotated: false,
    token: 'business-session-token',
    session: {
      createdAt: now,
      email: 'allowed@gmail.com',
      expiresAt,
      idleExpiresAt,
      lastSeenAt: now,
      name: 'Allowed User',
      role: 'business_admin',
      rotateAfter: new Date('2026-07-04T00:00:00.000Z'),
      subject: 'google-subject',
      tokenHash: 'token-hash',
    },
    user: {
      email: 'allowed@gmail.com',
      name: 'Allowed User',
      role: 'business_admin',
      status: 'active',
      subject: 'google-subject',
    },
  };
}

function createRequest(token?: string): FastifyRequest {
  return {
    cookies: token ? { business_session: token } : {},
    headers: {},
    ip: '127.0.0.1',
    url: '/api/business/auth/google',
  } as unknown as FastifyRequest;
}

function createReply() {
  return {
    clearCookie: jest.fn(),
    setCookie: jest.fn(),
  };
}
