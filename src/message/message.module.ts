import { Module } from '@nestjs/common';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';
import { MessageRateLimiterService } from './message-rate-limiter.service';
import { RecaptchaEnterpriseService } from './recaptcha-enterprise.service';

@Module({
  controllers: [MessageController],
  providers: [
    MessageService,
    RecaptchaEnterpriseService,
    MessageRateLimiterService,
  ],
  exports: [MessageService],
})
export class MessageModule {}
