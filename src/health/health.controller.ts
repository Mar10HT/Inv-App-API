import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Default pingCheck timeout is 1000ms, too tight for Railway's private
      // network right after a cold start/restart — Railway uses this endpoint
      // to gate whether a new deployment is ready, so a false "down" here was
      // causing it to kill fresh containers and keep serving stale ones.
      () =>
        this.prismaHealth.pingCheck('database', this.prisma, {
          timeout: 5000,
        }),
    ]);
  }
}
