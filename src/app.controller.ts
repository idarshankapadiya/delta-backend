import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import type { ApiIndex } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getApiIndex(): ApiIndex {
    return this.appService.getApiIndex();
  }
}
