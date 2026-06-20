import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CatalogAccessService } from './catalog-access.service';
import { CatalogController } from './catalog.controller';
import { CatalogOriginGuard } from './catalog-origin.guard';
import { CatalogRateLimiterService } from './catalog-rate-limiter.service';
import { CatalogService } from './catalog.service';

describe('CatalogController', () => {
  let controller: CatalogController;
  let catalogAccessService: CatalogAccessService;
  let catalogService: {
    createSignedUrlForSelection: jest.Mock;
    documentSelectionExists: jest.Mock;
    getCatalogAll: jest.Mock;
    getCatalogLibrary: jest.Mock;
  };

  beforeEach(async () => {
    catalogService = {
      createSignedUrlForSelection: jest.fn(),
      documentSelectionExists: jest.fn(),
      getCatalogAll: jest.fn(),
      getCatalogLibrary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        CatalogAccessService,
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
    expect(reply.redirect).toHaveBeenCalledWith('http://localhost:5173/');
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
        otp: '190399',
      },
      createRequest(),
      reply as unknown as FastifyReply,
    );

    expect(response.ok).toBe(true);
    expect(typeof response.expires_at).toBe('string');
    expect(reply.header.mock.calls[0]?.[1]).toContain('catalog_access=');
  });

  it('sets the access cookie when request-otp includes the master OTP', async () => {
    const reply = createReply();

    await expect(
      controller.requestAccessOtp(
        {
          name: 'Customer',
          mobile: '9999999999',
          channel: 'whatsapp',
          otp: '190399',
        },
        createRequest(),
        reply as unknown as FastifyReply,
      ),
    ).resolves.toMatchObject({
      ok: true,
      auth_provider: 'whatsapp_otp',
      mobile: '9999999999',
      name: 'Customer',
    });
    expect(reply.header.mock.calls[0]?.[1]).toContain('catalog_access=');
  });

  it('returns the current access session for a valid access cookie', async () => {
    const reply = createReply();

    await controller.requestAccessOtp(
      {
        name: 'Customer',
        mobile: '9999999999',
        channel: 'whatsapp',
        otp: '190399',
      },
      createRequest(),
      reply as unknown as FastifyReply,
    );

    const cookie = reply.header.mock.calls[0]?.[1] ?? '';

    expect(controller.getAccessMe(createRequest(cookie))).toMatchObject({
      ok: true,
      auth_provider: 'whatsapp_otp',
      mobile: '9999999999',
      name: 'Customer',
      expires_at: expect.any(String),
    });
  });

  it('rejects current access session lookup without the access cookie', () => {
    expect(() => controller.getAccessMe(createRequest())).toThrow(
      'Catalog access is required',
    );
  });

  it('returns signed URL details without the access cookie', async () => {
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
        otp: '190399',
      },
      createRequest(),
      reply as unknown as FastifyReply,
    );

    const cookie = reply.header.mock.calls[0]?.[1] ?? '';
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

  function createRequest(cookie?: string, origin?: string): FastifyRequest {
    return {
      ip: '127.0.0.1',
      headers: {
        cookie,
        origin,
      },
    } as FastifyRequest;
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
