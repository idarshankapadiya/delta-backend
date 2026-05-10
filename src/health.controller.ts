import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      message: 'delta backend is running',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
