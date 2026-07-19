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

  it('rejects wrong WhatsApp OTP verification without setting the access cookie', async () => {
    const otpRequest = await controller.requestAccessOtp(
      { name: 'Customer', mobile: '9999999999', channel: 'whatsapp' },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );
    const reply = createReply();
    const challengeId = getChallengeId(otpRequest);

    expect(() =>
      controller.verifyAccessOtp(
        {
          challenge_id: challengeId,
          mobile: '9999999999',
          otp: '000000',
        },
        createRequest(),
        reply as unknown as FastifyReply,
      ),
    ).toThrow('Invalid OTP');
    expect(reply.header).not.toHaveBeenCalled();
  });

  it('sets the access cookie for verified email OTP', async () => {
    const otpRequest = await controller.requestAccessOtp(
      {
        name: 'Customer',
        email: 'customer@example.com',
        channel: 'email',
      },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );
    const reply = createReply();
    const challengeId = getChallengeId(otpRequest);

    const response = controller.verifyAccessOtp(
      {
        challenge_id: challengeId,
        email: 'customer@example.com',
        otp: '654321',
      },
      createRequest(),
      reply as unknown as FastifyReply,
    );

    expect(response.ok).toBe(true);
    expect(typeof response.expires_at).toBe('string');
    expect(reply.header.mock.calls[0]?.[1]).toContain('catalog_access=');
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
        name: 'Customer',
        email: 'customer@example.com',
        channel: 'email',
      },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );

    expect(sendOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'email',
        email: 'customer@example.com',
      }),
      '654321',
    );
  });

  it('rejects contact-mismatched OTP challenges', async () => {
    const otpRequest = await controller.requestAccessOtp(
      {
        name: 'Customer',
        email: 'customer@example.com',
        channel: 'email',
      },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );

    expect(() =>
      controller.verifyAccessOtp(
        {
          challenge_id: getChallengeId(otpRequest),
          email: 'other@example.com',
          otp: '654321',
        },
        createRequest(),
        createReply() as unknown as FastifyReply,
      ),
    ).toThrow('Invalid OTP challenge');
  });

  it('rejects expired OTP challenges', async () => {
    const otpRequest = await controller.requestAccessOtp(
      { name: 'Customer', mobile: '9999999999', channel: 'whatsapp' },
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

    expect(() =>
      controller.verifyAccessOtp(
        {
          challenge_id: challengeId,
          mobile: '9999999999',
          otp: '654321',
        },
        createRequest(),
        createReply() as unknown as FastifyReply,
      ),
    ).toThrow('OTP challenge has expired');
  });

  it('locks OTP challenges after the configured maximum attempts', async () => {
    const previousMaxAttempts = process.env.CATALOG_OTP_MAX_ATTEMPTS;
    process.env.CATALOG_OTP_MAX_ATTEMPTS = '2';

    try {
      const otpRequest = await controller.requestAccessOtp(
        { name: 'Customer', mobile: '9999999999', channel: 'whatsapp' },
        createRequest(),
        createReply() as unknown as FastifyReply,
      );
      const challengeId = getChallengeId(otpRequest);
      const verifyWrongOtp = () =>
        controller.verifyAccessOtp(
          {
            challenge_id: challengeId,
            mobile: '9999999999',
            otp: '000000',
          },
          createRequest(),
          createReply() as unknown as FastifyReply,
        );

      expect(verifyWrongOtp).toThrow('Invalid OTP');
      expect(verifyWrongOtp).toThrow('OTP challenge is locked');
      expect(() =>
        controller.verifyAccessOtp(
          {
            challenge_id: challengeId,
            mobile: '9999999999',
            otp: '654321',
          },
          createRequest(),
          createReply() as unknown as FastifyReply,
        ),
      ).toThrow('OTP challenge is locked');
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
      { name: 'Customer', mobile: '9999999999', channel: 'whatsapp' },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );
    const challengeId = getChallengeId(otpRequest);
    const verification = {
      challenge_id: challengeId,
      mobile: '9999999999',
      otp: '654321',
    };

    expect(
      controller.verifyAccessOtp(
        verification,
        createRequest(),
        createReply() as unknown as FastifyReply,
      ).ok,
    ).toBe(true);
    expect(() =>
      controller.verifyAccessOtp(
        verification,
        createRequest(),
        createReply() as unknown as FastifyReply,
      ),
    ).toThrow('Invalid OTP challenge');
  });

  it('returns the current access session for a valid access cookie', async () => {
    const otpRequest = await controller.requestAccessOtp(
      { name: 'Customer', mobile: '9999999999', channel: 'whatsapp' },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );
    const reply = createReply();
    const challengeId = getChallengeId(otpRequest);

    controller.verifyAccessOtp(
      {
        challenge_id: challengeId,
        mobile: '9999999999',
        otp: '654321',
      },
      createRequest(),
      reply as unknown as FastifyReply,
    );

    const cookie = reply.header.mock.calls[0]?.[1] ?? '';

    const session = controller.getAccessMe(createRequest(cookie));

    expect(session).toMatchObject({
      ok: true,
      auth_provider: 'whatsapp_otp',
      mobile: '9999999999',
      name: 'Customer',
    });
    expect(typeof session.expires_at).toBe('string');
  });

  it('rejects current access session lookup without the access cookie', () => {
    expect(() => controller.getAccessMe(createRequest())).toThrow(
      'Catalog access is required',
    );
  });

  it('rejects signed URL access without the catalog access cookie', () => {
    expect(() =>
      catalogAccessGuard.canActivate(createContext(createRequest())),
    ).toThrow('Catalog access is required');
  });

  it('returns signed URL details for slug-based access', async () => {
    const otpRequest = await controller.requestAccessOtp(
      { name: 'Customer', mobile: '9999999999', channel: 'whatsapp' },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );
    const reply = createReply();
    const challengeId = getChallengeId(otpRequest);

    controller.verifyAccessOtp(
      {
        challenge_id: challengeId,
        mobile: '9999999999',
        otp: '654321',
      },
      createRequest(),
      reply as unknown as FastifyReply,
    );

    const cookie = reply.header.mock.calls[0]?.[1] ?? '';
    expect(
      catalogAccessGuard.canActivate(createContext(createRequest(cookie))),
    ).toBe(true);
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
        createRequest(cookie),
      ),
    ).resolves.toMatchObject({
      document_id: '01JABCDEF00000000000000000',
      url: 'https://storage.googleapis.com/signed',
    });
  });

  it('does not treat the former master OTP as a valid challenge code', async () => {
    const otpRequest = await controller.requestAccessOtp(
      { name: 'Customer', mobile: '9999999999', channel: 'whatsapp' },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );

    expect(() =>
      controller.verifyAccessOtp(
        {
          challenge_id: getChallengeId(otpRequest),
          mobile: '9999999999',
          otp: '190399',
        },
        createRequest(),
        createReply() as unknown as FastifyReply,
      ),
    ).toThrow('Invalid OTP');
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
          name: 'Customer',
          mobile: '9999999999',
          channel: 'whatsapp',
          otp: '190399',
        },
        { type: 'body', metatype: CatalogOtpRequestDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('revokes and clears the current catalog access session', async () => {
    const otpRequest = await controller.requestAccessOtp(
      { name: 'Customer', mobile: '9999999999', channel: 'whatsapp' },
      createRequest(),
      createReply() as unknown as FastifyReply,
    );
    const sessionReply = createReply();
    controller.verifyAccessOtp(
      {
        challenge_id: getChallengeId(otpRequest),
        mobile: '9999999999',
        otp: '654321',
      },
      createRequest(),
      sessionReply as unknown as FastifyReply,
    );
    const cookie = sessionReply.header.mock.calls[0]?.[1] ?? '';
    const logoutReply = createReply();

    expect(
      controller.logoutAccess(
        createRequest(cookie),
        logoutReply as unknown as FastifyReply,
      ),
    ).toEqual({ ok: true });
    expect(logoutReply.header.mock.calls[0]?.[1]).toContain('Max-Age=0');
    expect(() =>
      catalogAccessGuard.canActivate(createContext(createRequest(cookie))),
    ).toThrow('Catalog access is required');
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
