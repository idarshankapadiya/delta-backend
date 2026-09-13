import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { MessageService } from '../message/message.service';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { InternalAdminGuard } from './internal-admin.guard';

@Controller('internal/messages')
@UseGuards(InternalAdminGuard)
@UseInterceptors(NoStoreInterceptor)
@ApiTags('Internal Messages')
@ApiSecurity('internalAdmin')
export class InternalMessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get()
  @ApiOperation({ summary: 'List contact messages through the internal API' })
  getMessages() {
    return this.messageService.getMessages();
  }
}
