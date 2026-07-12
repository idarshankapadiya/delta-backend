import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BusinessSiteOriginGuard } from '../security/origin.guards';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { getClientIp, getUserAgent } from '../security/request-context';
import { BusinessAuthGuard } from './business-auth.guard';
import {
  BusinessAuthService,
  type BusinessAuthGrant,
} from './business-auth.service';
import { BusinessCsrfGuard } from './business-csrf.guard';
import {
  clearBusinessSessionCookie,
  getBusinessSessionToken,
  setBusinessSessionCookie,
} from './business-session-cookie';
import { BusinessGoogleAuthDto } from './dto/business-google-auth.dto';

@Controller('business/auth')
@UseGuards(BusinessSiteOriginGuard)
@UseInterceptors(NoStoreInterceptor)
export class BusinessAuthController {
  constructor(private readonly businessAuthService: BusinessAuthService) {}

  @Post('google')
  async authenticateWithGoogle(
    @Body() body: BusinessGoogleAuthDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const grant = await this.businessAuthService.authenticateWithGoogle(
      body.id_token,
      {
        ip: getClientIp(request),
        path: request.url,
        userAgent: getUserAgent(request),
      },
    );
    setBusinessSessionCookie(reply, grant.token);
    return this.createSessionResponse(grant);
  }

  @Get('me')
  async getCurrentUser(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const grant = await this.businessAuthService.restoreSession(
      getBusinessSessionToken(request),
      true,
    );

    if (grant.rotated) {
      setBusinessSessionCookie(reply, grant.token);
    }

    return this.createSessionResponse(grant);
  }

  @Post('logout')
  @UseGuards(BusinessAuthGuard, BusinessCsrfGuard)
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.businessAuthService.revokeSession(
      getBusinessSessionToken(request),
    );
    clearBusinessSessionCookie(reply);
    return { ok: true };
  }

  private createSessionResponse(grant: BusinessAuthGrant) {
    return {
      ok: true,
      auth_provider: 'google',
      authorized: true,
      csrf_token: grant.csrfToken,
      email: grant.user.email,
      expires_at: grant.session.expiresAt.toISOString(),
      idle_expires_at: grant.session.idleExpiresAt.toISOString(),
      name: grant.user.name,
      role: grant.user.role,
      subject: grant.user.subject,
    };
  }
}
