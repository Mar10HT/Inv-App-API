import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }

  // Railway's Hobby plan puts the Postgres service to sleep after a period
  // without queries, and wakes it (with a few seconds' delay and a crash
  // recovery cycle) on the next one — which was landing on real user
  // requests and on the scheduled cron jobs. A trivial query often enough
  // to stay under that idle threshold keeps the connection warm.
  @Interval(5 * 60 * 1000)
  async keepAlive() {
    try {
      await this.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.warn('Keep-alive query failed', error);
    }
  }
}
