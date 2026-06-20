import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CatalogAdminGuard } from '../catalog/catalog-admin.guard';
import { CatalogOriginGuard } from '../catalog/catalog-origin.guard';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessageService } from './message.service';

@Controller('message')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Post()
  @UseGuards(CatalogOriginGuard)
  createMessage(@Body() body: CreateMessageDto) {
    return this.messageService.createMessage(body);
  }

  @Get()
  @UseGuards(CatalogAdminGuard)
  getMessages() {
    return this.messageService.getMessages();
  }
}
