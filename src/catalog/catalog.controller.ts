import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CatalogAccessService } from './catalog-access.service';
import { CatalogService } from './catalog.service';
import { CatalogAccessDto } from './dto/catalog-access.dto';
import { CatalogDocumentParamsDto } from './dto/catalog-document-params.dto';
import { CatalogGoogleAccessDto } from './dto/catalog-google-access.dto';
import { CatalogGoogleRedirectDto } from './dto/catalog-google-redirect.dto';
import { CatalogLibraryDto } from './dto/catalog-library.dto';
import { CatalogOtpRequestDto } from './dto/catalog-otp-request.dto';
import { CatalogVerifyOtpDto } from './dto/catalog-verify-otp.dto';
import { DocumentAccessDto } from './dto/document-access.dto';
import { CatalogRateLimiterService } from './catalog-rate-limiter.service';
import { CatalogOriginGuard } from './catalog-origin.guard';
import { CatalogAdminGuard } from './catalog-admin.guard';
import { getCatalogUploadMaxBytes } from '../config/catalog.config';
import { getAllowedFrontendOrigins } from '../config/http.config';

interface CatalogMultipartFile {
  buffer: Buffer;
  filename: string;
}

interface CatalogMultipartUpload {
  fields: Record<string, string>;
  file?: CatalogMultipartFile;
}

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
  @UseGuards(CatalogOriginGuard)
  getCatalogLibrary(@Body() body: CatalogLibraryDto) {
    return this.catalogService.getCatalogLibrary(body.company_slugs);
  }

  @Post('access')
  @UseGuards(CatalogOriginGuard)
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
  @UseGuards(CatalogOriginGuard)
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
  @UseGuards(CatalogOriginGuard)
  getAccessMe(@Req() request: FastifyRequest) {
    const token = this.parseCookies(request.headers.cookie).catalog_access;

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
  @UseGuards(CatalogOriginGuard)
  async requestAccessOtp(
    @Body() body: CatalogOtpRequestDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
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

    if (body.otp) {
      const session = this.catalogAccessService.createMasterOtpAccess(body, {
        ip,
        userAgent: this.getUserAgent(request),
      });

      reply.header(
        'Set-Cookie',
        this.createAccessCookie(session.token, session.expiresAt),
      );

      return {
        ok: true,
        auth_provider: session.authProvider,
        email: session.email,
        mobile: session.mobile,
        name: session.name,
        expires_at: session.expiresAt.toISOString(),
      };
    }

    return this.catalogAccessService.requestOtp(body, {
      ip,
      userAgent: this.getUserAgent(request),
    });
  }

  @Post('access/verify-otp')
  @UseGuards(CatalogOriginGuard)
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
  @UseGuards(CatalogOriginGuard)
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

  @Post('documents')
  @UseGuards(CatalogOriginGuard, CatalogAdminGuard)
  async createCatalogDocument(@Req() request: FastifyRequest) {
    const upload = await this.readCatalogMultipartUpload(request, true);

    if (!upload.file) {
      throw new BadRequestException('PDF file is required');
    }

    return this.catalogService.createCatalogDocument({
      pdf: upload.file.buffer,
      uploadedFileName: upload.file.filename,
      companySlug: this.getRequiredField(upload.fields, 'company_slug'),
      categorySlug: upload.fields.category_slug,
      documentSlug: this.getRequiredField(upload.fields, 'document_slug'),
      displayName: upload.fields.display_name,
    });
  }

  @Put('documents/:document_id')
  @UseGuards(CatalogOriginGuard, CatalogAdminGuard)
  async updateCatalogDocument(
    @Param() params: CatalogDocumentParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const upload = await this.readCatalogMultipartUpload(request, false);

    return this.catalogService.updateCatalogDocument(params.document_id, {
      pdf: upload.file?.buffer,
      uploadedFileName: upload.file?.filename,
      categorySlug: upload.fields.category_slug,
      displayName: upload.fields.display_name,
    });
  }

  @Delete('documents/:document_id')
  @UseGuards(CatalogOriginGuard, CatalogAdminGuard)
  async deleteCatalogDocument(@Param() params: CatalogDocumentParamsDto) {
    return this.catalogService.deleteCatalogDocument(params.document_id);
  }

  private async readCatalogMultipartUpload(
    request: FastifyRequest,
    fileRequired: boolean,
  ): Promise<CatalogMultipartUpload> {
    if (!request.isMultipart()) {
      throw new BadRequestException('multipart/form-data is required');
    }

    const fields: Record<string, string> = {};
    let file: CatalogMultipartFile | undefined;

    for await (const part of request.parts({
      limits: {
        files: 1,
        fileSize: getCatalogUploadMaxBytes(),
        fields: 8,
        parts: 10,
      },
    })) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file') {
          throw new BadRequestException('PDF file field must be named file');
        }

        if (file) {
          throw new BadRequestException('Only one PDF file is allowed');
        }

        if (
          part.mimetype !== 'application/pdf' &&
          part.mimetype !== 'application/octet-stream'
        ) {
          throw new BadRequestException('Uploaded file must be a PDF');
        }

        file = {
          buffer: await part.toBuffer(),
          filename: part.filename,
        };
        continue;
      }

      fields[part.fieldname] = this.getMultipartFieldValue(part.value);
    }

    if (fileRequired && !file) {
      throw new BadRequestException('PDF file is required');
    }

    return { fields, file };
  }

  private getRequiredField(
    fields: Record<string, string>,
    fieldName: string,
  ): string {
    const value = fields[fieldName]?.trim();

    if (!value) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return value;
  }

  private getMultipartFieldValue(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }

    return '';
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
      `catalog_access=${encodeURIComponent(token)}`,
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

  private getFrontendHomeUrl(): string {
    const configuredUrl =
      process.env.CATALOG_GOOGLE_REDIRECT_URL?.trim() ||
      process.env.FRONTEND_BASE_URL?.trim() ||
      getAllowedFrontendOrigins()[0] ||
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
