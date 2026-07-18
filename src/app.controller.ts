import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';
import { HealthService } from './common/health/health.service';

type CsrfRequest = Request & {
  csrfToken?: () => string;
};

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly healthService: HealthService,
  ) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Public()
  @Get('health')
  async getHealth() {
    const report = await this.healthService.check();

    return {
      success: true,
      data: {
        healthy: report.healthy,
        db: report.db,
        mongo: report.mongo,
        redis: report.redis,
      },
    };
  }

  @Public()
  @Get('api/v1/csrf-token')
  getCsrfToken(@Req() request: CsrfRequest) {
    return {
      success: true,
      data: {
        csrfToken: request.csrfToken?.() ?? '',
      },
    };
  }
}
