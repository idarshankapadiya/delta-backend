import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import type { ApiIndex } from './app.service';

@Controller()
@ApiTags('System')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'List available API endpoints' })
  getApiIndex(): ApiIndex {
    return this.appService.getApiIndex();
  }
}
