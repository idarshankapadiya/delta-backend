import {
  Body,
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CatalogAccessService } from './catalog-access.service';
import { CatalogService } from './catalog.service';
import { CatalogAccessDto } from './dto/catalog-access.dto';
import { CatalogGoogleAccessDto } from './dto/catalog-google-access.dto';
import { CatalogGoogleRedirectDto } from './dto/catalog-google-redirect.dto';
import { CatalogLibraryDto } from './dto/catalog-library.dto';
import { CatalogOtpRequestDto } from './dto/catalog-otp-request.dto';
import { CatalogVerifyOtpDto } from './dto/catalog-verify-otp.dto';
import { DocumentAccessDto } from './dto/document-access.dto';
import { CatalogRateLimiterService } from './catalog-rate-limiter.service';
import { PublicSiteOriginGuard } from '../security/origin.guards';
import { getPublicSiteOrigins } from '../config/origin.config';
import { catalogAccessCookieName } from './catalog-access.guard';
import { NoStoreInterceptor } from '../security/no-store.interceptor';

@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly catalogAccessService: CatalogAccessService,
    private readonly rateLimiter: CatalogRateLimiterService,
  ) {}

  @Get('all')
  getCatalogAll() {
    return this.catalogService.getCatalogAll();
  }

  @Post('library')
  @UseGuards(PublicSiteOriginGuard)
  getCatalogLibrary(@Body() body: CatalogLibraryDto) {
    return this.catalogService.getCatalogLibrary(body.company_slugs);
  }

  @Post('access')
  @UseGuards(PublicSiteOriginGuard)
  createAccess(@Body() body: CatalogAccessDto, @Req() request: FastifyRequest) {
    const ip = this.getClientIp(request);
    this.rateLimiter.assertAllowed(
      `catalog-access:${ip}`,
      5,
      60 * 60 * 1000,
      'Too many catalog access requests',
    );

    return this.catalogAccessService.recordInquiry(body, {
      ip,
      userAgent: this.getUserAgent(request),
    });
  }

  @Post('access/google')
  @UseGuards(PublicSiteOriginGuard)
  @UseInterceptors(NoStoreInterceptor)
  async createGoogleAccess(
    @Body() body: CatalogGoogleAccessDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const ip = this.getClientIp(request);
    this.rateLimiter.assertAllowed(
      `catalog-google-access:${ip}`,
      20,
      60 * 60 * 1000,
      'Too many Google sign-in attempts',
    );

    const session = await this.catalogAccessService.createGoogleAccess(
      body.id_token,
      {
        ip,
        userAgent: this.getUserAgent(request),
      },
    );

    reply.header(
      'Set-Cookie',
      this.createAccessCookie(session.token, session.expiresAt),
    );

    return {
      ok: true,
      auth_provider: session.authProvider,
      email: session.email,
      name: session.name,
      expires_at: session.expiresAt.toISOString(),
    };
  }

  @Post('access/google/redirect')
  @UseInterceptors(NoStoreInterceptor)
  async createGoogleRedirectAccess(
    @Body() body: CatalogGoogleRedirectDto,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    this.assertGoogleCsrfToken(body.g_csrf_token, request);

    const ip = this.getClientIp(request);
    this.rateLimiter.assertAllowed(
      `catalog-google-access:${ip}`,
      20,
      60 * 60 * 1000,
      'Too many Google sign-in attempts',
    );

    const session = await this.catalogAccessService.createGoogleAccess(
      body.credential,
      {
        ip,
        userAgent: this.getUserAgent(request),
      },
    );

    reply.header(
      'Set-Cookie',
      this.createAccessCookie(session.token, session.expiresAt),
    );

    return reply.code(303).redirect(this.getFrontendHomeUrl());
  }

  @Get('access/me')
  @UseGuards(PublicSiteOriginGuard)
  @UseInterceptors(NoStoreInterceptor)
  getAccessMe(@Req() request: FastifyRequest) {
    const token = request.cookies?.[catalogAccessCookieName];

    if (!token) {
      throw new UnauthorizedException('Catalog access is required');
    }

    const session = this.catalogAccessService.getAccessSession(token);

    if (!session) {
      throw new UnauthorizedException('Catalog access is required');
    }

    return {
      ok: true,
      auth_provider: session.authProvider,
      email: session.email,
      mobile: session.mobile,
      name: session.name,
      expires_at: session.expiresAt.toISOString(),
    };
  }

  @Post('access/request-otp')
  @UseGuards(PublicSiteOriginGuard)
  @UseInterceptors(NoStoreInterceptor)
  async requestAccessOtp(
    @Body() body: CatalogOtpRequestDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    void reply;
    const ip = this.getClientIp(request);
    const contactKey =
      body.channel === 'email'
        ? body.email?.trim().toLowerCase()
        : body.mobile?.trim();

    this.rateLimiter.assertAllowed(
      `catalog-otp-request:${body.channel}:${ip}`,
      5,
      60 * 60 * 1000,
      'Too many OTP requests',
    );

    if (contactKey) {
      this.rateLimiter.assertAllowed(
        `catalog-otp-contact:${body.channel}:${contactKey}`,
        5,
        60 * 60 * 1000,
        'Too many OTP requests',
      );
    }

    return this.catalogAccessService.requestOtp(body, {
      ip,
      userAgent: this.getUserAgent(request),
    });
  }

  @Post('access/verify-otp')
  @UseGuards(PublicSiteOriginGuard)
  @UseInterceptors(NoStoreInterceptor)
  verifyAccessOtp(
    @Body() body: CatalogVerifyOtpDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const ip = this.getClientIp(request);
    this.rateLimiter.assertAllowed(
      `catalog-otp-verify:${ip}`,
      20,
      60 * 60 * 1000,
      'Too many OTP verification attempts',
    );

    const session = this.catalogAccessService.verifyOtp(body, {
      ip,
      userAgent: this.getUserAgent(request),
    });

    reply.header(
      'Set-Cookie',
      this.createAccessCookie(session.token, session.expiresAt),
    );
    return {
      ok: true,
      expires_at: session.expiresAt.toISOString(),
    };
  }

  @Post('documents/access')
  @UseGuards(PublicSiteOriginGuard)
  @UseInterceptors(NoStoreInterceptor)
  async createDocumentAccess(
    @Body() body: DocumentAccessDto,
    @Req() request: FastifyRequest,
  ) {
    const ip = this.getClientIp(request);

    this.rateLimiter.assertAllowed(
      `document-sign:${ip}`,
      60,
      60 * 60 * 1000,
      'Too many document access requests',
    );

    const exists = await this.catalogService.documentSelectionExists(body);

    if (!exists) {
      this.rateLimiter.assertAllowed(
        `invalid-document:${ip}`,
        10,
        60 * 60 * 1000,
        'Too many invalid document requests',
      );
      throw new NotFoundException('Document was not found');
    }

    if (body.action === 'download') {
      this.rateLimiter.assertAllowed(
        `download:${ip}`,
        20,
        24 * 60 * 60 * 1000,
        'Too many downloads for this access session',
      );
    }

    return this.catalogService.createSignedUrlForSelection(body, body.action);
  }

  @Post('access/logout')
  @UseGuards(PublicSiteOriginGuard)
  @UseInterceptors(NoStoreInterceptor)
  logoutAccess(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.catalogAccessService.revokeAccessSession(
      request.cookies?.[catalogAccessCookieName],
    );
    reply.header('Set-Cookie', this.createClearedAccessCookie());
    return { ok: true };
  }

  private assertGoogleCsrfToken(
    bodyCsrfToken: string,
    request: FastifyRequest,
  ): void {
    const cookieCsrfToken = this.parseCookies(
      request.headers.cookie,
    ).g_csrf_token;

    if (!cookieCsrfToken || cookieCsrfToken !== bodyCsrfToken) {
      throw new BadRequestException('Invalid Google sign-in CSRF token');
    }
  }

  private parseCookies(
    cookieHeader: string | undefined,
  ): Record<string, string> {
    if (!cookieHeader) {
      return {};
    }

    return cookieHeader
      .split(';')
      .reduce<Record<string, string>>((cookies, part) => {
        const [rawName, ...rawValue] = part.trim().split('=');

        if (!rawName) {
          return cookies;
        }

        cookies[rawName] = decodeURIComponent(rawValue.join('='));
        return cookies;
      }, {});
  }

  private createAccessCookie(token: string, expiresAt: Date): string {
    const cookieParts = [
      `${catalogAccessCookieName}=${encodeURIComponent(token)}`,
      'Path=/api/catalog',
      'HttpOnly',
      'SameSite=Lax',
      `Expires=${expiresAt.toUTCString()}`,
    ];

    if (process.env.NODE_ENV === 'production') {
      cookieParts.push('Secure');
    }

    return cookieParts.join('; ');
  }

  private createClearedAccessCookie(): string {
    const cookieParts = [
      `${catalogAccessCookieName}=`,
      'Path=/api/catalog',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ];

    if (process.env.NODE_ENV === 'production') {
      cookieParts.push('Secure');
    }

    return cookieParts.join('; ');
  }

  private getFrontendHomeUrl(): string {
    const configuredUrl =
      process.env.CATALOG_GOOGLE_REDIRECT_URL?.trim() ||
      process.env.FRONTEND_BASE_URL?.trim() ||
      getPublicSiteOrigins()[0] ||
      'http://localhost:5173';

    try {
      const url = new URL(configuredUrl);
      url.pathname = '/';
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch {
      return 'http://localhost:5173/';
    }
  }

  private getClientIp(request: FastifyRequest): string {
    const forwardedFor = request.headers['x-forwarded-for'];

    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
      return forwardedFor.split(',')[0].trim();
    }

    return request.ip;
  }

  private getUserAgent(request: FastifyRequest): string | undefined {
    const userAgent = request.headers['user-agent'];

    if (Array.isArray(userAgent)) {
      return userAgent.join(', ');
    }

    return userAgent;
  }
}
