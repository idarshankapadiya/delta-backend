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
import {
  ApiCookieAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
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
@ApiTags('Business Authentication')
export class BusinessAuthController {
  constructor(private readonly businessAuthService: BusinessAuthService) {}

  @Post('google')
  @ApiOperation({ summary: 'Create a business session with Google' })
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
  @ApiCookieAuth('businessSession')
  @ApiOperation({ summary: 'Get the current business session' })
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
  @ApiSecurity({ businessSession: [], csrfToken: [] })
  @ApiOperation({ summary: 'Log out of the business session' })
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
      auth_provider: grant.authProvider,
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
