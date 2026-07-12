import {
  Controller,
  Get,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { MessageService } from '../message/message.service';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { BusinessSiteOriginGuard } from '../security/origin.guards';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthGuard } from './business-auth.guard';
import type { BusinessAuthRequest } from './business-auth.types';

@Controller('business/messages')
@UseGuards(BusinessSiteOriginGuard, BusinessAuthGuard)
@UseInterceptors(NoStoreInterceptor)
export class BusinessMessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly audit: SecurityAuditService,
  ) {}

  @Get()
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
}
