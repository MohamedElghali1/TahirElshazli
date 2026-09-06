import { Controller, Get } from '@nestjs/common';
import { AppService, type HealthStatus } from './app.service.js';
import { Public } from './auth/public.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * The container's liveness probe. `Dockerfile.backend` and
   * `backend/Dockerfile` already HEALTHCHECK `/health`, which nothing served -
   * so the container reported unhealthy for its whole life.
   *
   * Deliberately anonymous, and deliberately says nothing but "the process is
   * up": no version, no dependency status, no configuration. An unauthenticated
   * endpoint that reports which services are reachable is reconnaissance.
   */
  @Get('health')
  @Public()
  getHealth(): HealthStatus {
    return this.appService.getHealth();
  }
}
