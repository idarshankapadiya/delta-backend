import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@Controller('health')
@ApiTags('System')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Check backend health' })
  check() {
    return {
      message: 'delta backend is running',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
