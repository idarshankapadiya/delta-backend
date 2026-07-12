import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { PublicSiteOriginGuard } from '../security/origin.guards';
import { getClientIp } from '../security/request-context';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessageService } from './message.service';
import { MessageRateLimiterService } from './message-rate-limiter.service';
import { RecaptchaEnterpriseService } from './recaptcha-enterprise.service';

@Controller('message')
@UseInterceptors(NoStoreInterceptor)
export class MessageController {
  constructor(
    private readonly messageService: MessageService,
    private readonly recaptcha: RecaptchaEnterpriseService,
    private readonly rateLimiter: MessageRateLimiterService,
  ) {}

  @Post()
  @UseGuards(PublicSiteOriginGuard)
  async createMessage(
    @Body() body: CreateMessageDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const ip = getClientIp(request);
    const contactKey = `${body.email.trim().toLowerCase()}:${body.mobile.trim()}`;
    await this.rateLimiter.assertAllowed(
      `contact-message-ip:${ip}`,
      5,
      60 * 60 * 1000,
      'Too many contact messages',
    );
    await this.recaptcha.verify(body.captcha_token, 'contact_message', ip);
    await this.rateLimiter.assertAllowed(
      `contact-message-contact:${contactKey}`,
      1,
      10 * 60 * 1000,
      'Please wait before sending another message',
    );
    reply.header('Cache-Control', 'no-store');
    return this.messageService.createMessage({
      email: body.email,
      message: body.message,
      mobile: body.mobile,
      name: body.name,
    });
  }
}
