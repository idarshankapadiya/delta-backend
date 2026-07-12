import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { MessageService } from '../message/message.service';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { InternalAdminGuard } from './internal-admin.guard';

@Controller('internal/messages')
@UseGuards(InternalAdminGuard)
@UseInterceptors(NoStoreInterceptor)
export class InternalMessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get()
  getMessages() {
    return this.messageService.getMessages();
  }
}
