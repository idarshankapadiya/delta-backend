import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CatalogAccessService } from './catalog-access.service';
import { CatalogAccessGuard } from './catalog-access.guard';
import { CatalogController } from './catalog.controller';
import { CatalogOriginGuard } from './catalog-origin.guard';
import { CatalogRateLimiterService } from './catalog-rate-limiter.service';
import { CatalogService } from './catalog.service';
import { CatalogOtpRequestDto } from './dto/catalog-otp-request.dto';
import { RecaptchaEnterpriseService } from '../message/recaptcha-enterprise.service';
import { MessageRateLimiterService } from '../message/message-rate-limiter.service';

describe('CatalogController', () => {
  const originalOtpDeliveryEnabled = process.env.CATALOG_OTP_DELIVERY_ENABLED;
  let controller: CatalogController;
  let catalogAccessService: CatalogAccessService;
  let catalogAccessGuard: CatalogAccessGuard;
  let catalogService: {
    createCatalogDocument: jest.Mock;
    createSignedUrlForSelection: jest.Mock;
    documentSelectionExists: jest.Mock;
    getCatalogAll: jest.Mock;
    getCatalogLibrary: jest.Mock;
    updateCatalogCompany: jest.Mock;
    updateCatalogDocument: jest.Mock;
  };

  beforeEach(async () => {
    catalogService = {
      createCatalogDocument: jest.fn(),
      createSignedUrlForSelection: jest.fn(),
      documentSelectionExists: jest.fn(),
      getCatalogAll: jest.fn(),
      getCatalogLibrary: jest.fn(),
      updateCatalogCompany: jest.fn(),
      updateCatalogDocument: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        CatalogAccessService,
        CatalogAccessGuard,
        CatalogRateLimiterService,
        CatalogOriginGuard,
        {
          provide: RecaptchaEnterpriseService,
          useValue: { verify: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: MessageRateLimiterService,
          useValue: { assertAllowed: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: CatalogService,
          useValue: catalogService,
        },
      ],
    }).compile();

    controller = module.get<CatalogController>(CatalogController);
    catalogAccessService =
      module.get<CatalogAccessService>(CatalogAccessService);
    catalogAccessGuard = module.get<CatalogAccessGuard>(CatalogAccessGuard);
    process.env.CATALOG_OTP_DELIVERY_ENABLED = 'true';
    jest
      .spyOn(
        catalogAccessService as unknown as { createOtp(): string },
        'createOtp',
      )
      .mockReturnValue('654321');
  });

  afterAll(() => {
    if (originalOtpDeliveryEnabled === undefined) {
      delete process.env.CATALOG_OTP_DELIVERY_ENABLED;
    } else {
      process.env.CATALOG_OTP_DELIVERY_ENABLED = originalOtpDeliveryEnabled;
    }
  });

  it('records access inquiries without setting the access cookie', () => {
    expect(
      controller.createAccess(
        { name: 'Customer', mobile: '9999999999' },
        createRequest(),
      ),
    ).toEqual({
      ok: true,
      inquiry_only: true,
    });
  });

  it('sets the access cookie for verified Google sign-in', async () => {
    jest.spyOn(catalogAccessService, 'createGoogleAccess').mockResolvedValue({
      token: 'google-session-token',
      expiresAt: new Date('2026-07-19T00:00:00.000Z'),
      authProvider: 'google',
      email: 'customer@example.com',
      name: 'Customer',
    });
    const reply = createReply();

    await expect(
      controller.createGoogleAccess(
        { id_token: 'google-id-token' },
        createRequest(),
        reply as unknown as FastifyReply,
      ),
    ).resolves.toEqual({
      ok: true,
      auth_provider: 'google',
      email: 'customer@example.com',
      name: 'Customer',
      expires_at: '2026-07-19T00:00:00.000Z',
    });
    expect(reply.header.mock.calls[0]?.[1]).toContain(
      'catalog_access=google-session-token',
    );
  });

  it('sets the access cookie and redirects home for Google redirect sign-in', async () => {
    jest.spyOn(catalogAccessService, 'createGoogleAccess').mockResolvedValue({
      token: 'google-redirect-session-token',
      expiresAt: new Date('2026-07-19T00:00:00.000Z'),
      authProvider: 'google',
      email: 'customer@example.com',
      name: 'Customer',
    });
    const reply = createReply();

    await controller.createGoogleRedirectAccess(
      {
        credential: 'google-id-token',
        g_csrf_token: 'csrf-token',
      },
      createRequest('g_csrf_token=csrf-token'),
      reply as unknown as FastifyReply,
    );

    expect(reply.header.mock.calls[0]?.[1]).toContain(
      'catalog_access=google-redirect-session-token',
    );
    expect(reply.code).toHaveBeenCalledWith(303);
    expect(reply.redirect).toHaveBeenCalledWith('https://darshanent.co.in/');
  });

  it('rejects Google redirect sign-in when the CSRF token is invalid', async () => {
    const reply = createReply();

    await expect(
      controller.createGoogleRedirectAccess(
        {
          credential: 'google-id-token',
          g_csrf_token: 'body-csrf-token',
        },
        createRequest('g_csrf_token=cookie-csrf-token'),
        reply as unknown as FastifyReply,
      ),
    ).rejects.toThrow('Invalid Google sign-in CSRF token');
    expect(reply.header).not.toHaveBeenCalled();
    expect(reply.redirect).not.toHaveBeenCalled();
  });

  it('rejects wrong SMS OTP verification without setting the access cookie', async () => {
    const otpRequest = await controller.requestAccessOtp(
      { identifier: '9999999999' },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );
    const reply = createReply();
    const challengeId = getChallengeId(otpRequest);

    await expect(
      controller.verifyAccessOtp(
        {
          challenge_id: challengeId,
          code: '000000',
        },
        createRequest(),
        reply as unknown as FastifyReply,
      ),
    ).rejects.toThrow('Invalid OTP');
    expect(reply.header).not.toHaveBeenCalled();
  });

  it('sets the access cookie for a verified Firebase email link', async () => {
    jest
      .spyOn(catalogAccessService, 'createFirebaseEmailAccess')
      .mockResolvedValue({
        token: 'firebase-session-token',
        expiresAt: new Date('2026-07-19T00:00:00.000Z'),
        authProvider: 'firebase_email_link',
        customerId: 'customer-id',
        email: 'customer@example.com',
        name: 'customer',
        isNewUser: true,
        profileComplete: false,
      });
    const reply = createReply();

    const response = await controller.createFirebaseEmailAccess(
      { id_token: 'firebase-id-token' },
      createRequest(),
      reply as unknown as FastifyReply,
    );

    expect(response.ok).toBe(true);
    expect(response.auth_provider).toBe('firebase_email_link');
    expect(reply.header.mock.calls[0]?.[1]).toContain(
      'catalog_access=firebase-session-token',
    );
  });

  it('creates and claims a cross-device Firebase email-link handoff', async () => {
    jest
      .spyOn(catalogAccessService, 'requestFirebaseEmailLink')
      .mockResolvedValue({
        challenge_id: 'email-challenge',
        link_token: 'link-token',
        claim_token: 'claim-token',
        expires_at: '2026-07-19T00:00:00.000Z',
      });

    await expect(
      controller.requestFirebaseEmailLink(
        { email: 'Customer@Example.com' },
        createRequest(),
      ),
    ).resolves.toMatchObject({ challenge_id: 'email-challenge' });

    jest
      .spyOn(catalogAccessService, 'claimFirebaseEmailLink')
      .mockResolvedValue({
        token: 'claimed-session-token',
        expiresAt: new Date('2026-07-19T00:00:00.000Z'),
        authProvider: 'firebase_email_link',
        customerId: 'customer-id',
        email: 'customer@example.com',
        name: 'customer',
      });
    const reply = createReply();
    const response = await controller.claimFirebaseEmailLink(
      { challenge_id: 'email-challenge', claim_token: 'claim-token' },
      createRequest(),
      reply as unknown as FastifyReply,
    );

    expect(response.status).toBe('complete');
    expect(reply.header.mock.calls[0]?.[1]).toContain(
      'catalog_access=claimed-session-token',
    );
  });

  it('resends an active OTP after the cooldown', async () => {
    const otpRequest = await controller.requestAccessOtp(
      { identifier: '9999999999' },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );
    const challengeId = getChallengeId(otpRequest);
    const challenges = (
      catalogAccessService as unknown as {
        otpChallenges: Map<string, { lastSentAt: Date }>;
      }
    ).otpChallenges;
    challenges.get(challengeId)!.lastSentAt = new Date(0);

    await expect(
      controller.resendAccessOtp(
        { challenge_id: challengeId },
        createRequest(),
      ),
    ).resolves.toMatchObject({
      challenge_id: challengeId,
      channel: 'sms',
      masked_destination: '+91 ******9999',
    });
  });

  it('invokes OTP delivery for each new challenge', async () => {
    const sendOtp = jest
      .spyOn(
        catalogAccessService as unknown as {
          sendOtp(challenge: unknown, otp: string): Promise<void>;
        },
        'sendOtp',
      )
      .mockResolvedValue(undefined);

    await controller.requestAccessOtp(
      {
        identifier: '9999999999',
      },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );

    expect(sendOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'sms',
        mobile: '+919999999999',
      }),
      '654321',
    );
  });

  it('rejects an unknown OTP challenge', async () => {
    await expect(
      controller.verifyAccessOtp(
        { challenge_id: 'unknown-challenge', code: '654321' },
        createRequest(),
        createReply() as unknown as FastifyReply,
      ),
    ).rejects.toThrow('Invalid OTP challenge');
  });

  it('rejects expired OTP challenges', async () => {
    const otpRequest = await controller.requestAccessOtp(
      { identifier: '9999999999' },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );
    const challengeId = getChallengeId(otpRequest);
    const challenges = (
      catalogAccessService as unknown as {
        otpChallenges: Map<string, { expiresAt: Date }>;
      }
    ).otpChallenges;
    const challenge = challenges.get(challengeId);

    expect(challenge).toBeDefined();
    challenge!.expiresAt = new Date(0);

    await expect(
      controller.verifyAccessOtp(
        {
          challenge_id: challengeId,
          code: '654321',
        },
        createRequest(),
        createReply() as unknown as FastifyReply,
      ),
    ).rejects.toThrow('OTP challenge has expired');
  });

  it('locks OTP challenges after the configured maximum attempts', async () => {
    const previousMaxAttempts = process.env.CATALOG_OTP_MAX_ATTEMPTS;
    process.env.CATALOG_OTP_MAX_ATTEMPTS = '2';

    try {
      const otpRequest = await controller.requestAccessOtp(
        { identifier: '9999999999' },
        createRequest(),
        createReply() as unknown as FastifyReply,
      );
      const challengeId = getChallengeId(otpRequest);
      const verifyWrongOtp = () =>
        controller.verifyAccessOtp(
          {
            challenge_id: challengeId,
            code: '000000',
          },
          createRequest(),
          createReply() as unknown as FastifyReply,
        );

      await expect(verifyWrongOtp()).rejects.toThrow('Invalid OTP');
      await expect(verifyWrongOtp()).rejects.toThrow('OTP challenge is locked');
      await expect(
        controller.verifyAccessOtp(
          {
            challenge_id: challengeId,
            code: '654321',
          },
          createRequest(),
          createReply() as unknown as FastifyReply,
        ),
      ).rejects.toThrow('OTP challenge is locked');
    } finally {
      if (previousMaxAttempts === undefined) {
        delete process.env.CATALOG_OTP_MAX_ATTEMPTS;
      } else {
        process.env.CATALOG_OTP_MAX_ATTEMPTS = previousMaxAttempts;
      }
    }
  });

  it('rejects replay of a verified OTP challenge', async () => {
    const otpRequest = await controller.requestAccessOtp(
      { identifier: '9999999999' },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );
    const challengeId = getChallengeId(otpRequest);
    const verification = {
      challenge_id: challengeId,
      code: '654321',
    };

    await expect(
      controller.verifyAccessOtp(
        verification,
        createRequest(),
        createReply() as unknown as FastifyReply,
      ),
    ).resolves.toMatchObject({ ok: true, is_new_user: true });
    await expect(
      controller.verifyAccessOtp(
        verification,
        createRequest(),
        createReply() as unknown as FastifyReply,
      ),
    ).rejects.toThrow('Invalid OTP challenge');
  });

  it('returns the current access session for a valid access cookie', async () => {
    const otpRequest = await controller.requestAccessOtp(
      { identifier: '9999999999' },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );
    const reply = createReply();
    const challengeId = getChallengeId(otpRequest);

    await controller.verifyAccessOtp(
      {
        challenge_id: challengeId,
        code: '654321',
      },
      createRequest(),
      reply as unknown as FastifyReply,
    );

    const cookie = reply.header.mock.calls[0]?.[1] ?? '';

    const session = await controller.getAccessMe(createRequest(cookie));

    expect(session).toMatchObject({
      ok: true,
      auth_provider: 'sms_otp',
      mobile: '+919999999999',
      name: 'Customer',
    });
    expect(typeof session.expires_at).toBe('string');
  });

  it('rejects current access session lookup without the access cookie', async () => {
    await expect(controller.getAccessMe(createRequest())).rejects.toThrow(
      'Catalog access is required',
    );
  });

  it('rejects signed URL access without the catalog access cookie', async () => {
    await expect(
      catalogAccessGuard.canActivate(createContext(createRequest())),
    ).rejects.toThrow('Catalog access is required');
  });

  it('returns signed URL details for public slug-based access', async () => {
    catalogService.documentSelectionExists.mockResolvedValue(true);
    catalogService.createSignedUrlForSelection.mockResolvedValue({
      document_id: '01JABCDEF00000000000000000',
      url: 'https://storage.googleapis.com/signed',
      expires_at: '2026-06-16T18:30:00.000Z',
      ttl_seconds: 900,
      file_name: 'PMS_Metering.pdf',
    });

    await expect(
      controller.createDocumentAccess(
        {
          company_slug: 'schneider',
          category_slug: 'industrial-automation',
          document_slug: 'plc-catalog',
          action: 'preview',
        },
        createRequest(),
      ),
    ).resolves.toMatchObject({
      document_id: '01JABCDEF00000000000000000',
      url: 'https://storage.googleapis.com/signed',
    });
  });

  it('does not treat the former master OTP as a valid challenge code', async () => {
    const otpRequest = await controller.requestAccessOtp(
      { identifier: '9999999999' },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );

    await expect(
      controller.verifyAccessOtp(
        {
          challenge_id: getChallengeId(otpRequest),
          code: '190399',
        },
        createRequest(),
        createReply() as unknown as FastifyReply,
      ),
    ).rejects.toThrow('Invalid OTP');
  });

  it('rejects an OTP supplied to the request-otp payload', async () => {
    const pipe = new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    });

    await expect(
      pipe.transform(
        {
          identifier: '9999999999',
          code: '190399',
        },
        { type: 'body', metatype: CatalogOtpRequestDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revokes and clears the current catalog access session', async () => {
    const otpRequest = await controller.requestAccessOtp(
      { identifier: '9999999999' },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );
    const sessionReply = createReply();
    await controller.verifyAccessOtp(
      {
        challenge_id: getChallengeId(otpRequest),
        code: '654321',
      },
      createRequest(),
      sessionReply as unknown as FastifyReply,
    );
    const cookie = sessionReply.header.mock.calls[0]?.[1] ?? '';
    const logoutReply = createReply();

    await expect(
      controller.logoutAccess(
        createRequest(cookie),
        logoutReply as unknown as FastifyReply,
      ),
    ).resolves.toEqual({ ok: true });
    expect(logoutReply.header.mock.calls[0]?.[1]).toContain('Max-Age=0');
    await expect(
      catalogAccessGuard.canActivate(createContext(createRequest(cookie))),
    ).rejects.toThrow('Catalog access is required');
  });

  function createRequest(cookie?: string, origin?: string): FastifyRequest {
    const cookies = Object.fromEntries(
      (cookie ?? '')
        .split(';')
        .map((part) => part.trim().split('='))
        .filter(([name, value]) => Boolean(name && value))
        .map(([name, ...value]) => [name, decodeURIComponent(value.join('='))]),
    );

    return {
      ip: '127.0.0.1',
      cookies,
      headers: {
        cookie,
        origin,
      },
    } as FastifyRequest;
  }

  function createContext(request: FastifyRequest) {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as never;
  }

  function createReply(): {
    code: jest.MockedFunction<(statusCode: number) => unknown>;
    header: jest.MockedFunction<(name: string, value: string) => void>;
    redirect: jest.MockedFunction<(url: string) => void>;
  } {
    const reply = {
      code: jest.fn(),
      header: jest.fn(),
      redirect: jest.fn(),
    };

    reply.code.mockReturnValue(reply);

    return {
      code: reply.code,
      header: reply.header,
      redirect: reply.redirect,
    };
  }

  function getChallengeId(response: unknown): string {
    if (
      typeof response === 'object' &&
      response !== null &&
      'challenge_id' in response &&
      typeof response.challenge_id === 'string'
    ) {
      return response.challenge_id;
    }

    throw new Error('Expected OTP challenge response');
  }
});
