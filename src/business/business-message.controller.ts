import {
  Controller,
  Delete,
  Get,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { MessageService } from '../message/message.service';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { BusinessSiteOriginGuard } from '../security/origin.guards';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthGuard } from './business-auth.guard';
import type { BusinessAuthRequest } from './business-auth.types';
import { BusinessCsrfGuard } from './business-csrf.guard';

@Controller('business/messages')
@UseGuards(BusinessSiteOriginGuard, BusinessAuthGuard)
@UseInterceptors(NoStoreInterceptor)
@ApiTags('Business Messages')
export class BusinessMessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly audit: SecurityAuditService,
  ) {}

  @Get()
  @ApiCookieAuth('businessSession')
  @ApiOperation({ summary: 'List contact messages' })
  async getMessages(@Req() request: FastifyRequest) {
    const response = await this.messageService.getMessages();
    const session = (request as BusinessAuthRequest).businessSession;
    this.audit.record({
      action: 'contact_messages_read',
      outcome: 'allowed',
      email: session?.email,
      path: request.url,
      subject: session?.subject,
    });
    return response;
  }

  @Delete(':message_id')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity({ businessSession: [], csrfToken: [] })
  @ApiOperation({ summary: 'Delete a contact message' })
  async deleteMessage(
    @Param('message_id') messageId: string,
    @Req() request: FastifyRequest,
  ) {
    const response = await this.messageService.deleteMessage(messageId);
    const session = (request as BusinessAuthRequest).businessSession;
    this.audit.record({
      action: 'contact_message_delete',
      outcome: 'allowed',
      email: session?.email,
      path: request.url,
      subject: session?.subject,
    });
    return response;
  }
}
