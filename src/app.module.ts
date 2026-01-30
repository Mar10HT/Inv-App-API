import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerModule } from './logger';
import { PrismaModule } from './prisma/prisma.module';
import { InventoryModule } from './inventory/inventory.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { CategoriesModule } from './categories/categories.module';
import { UsersModule } from './users/users.module';
import { TransactionsModule } from './transactions/transactions.module';
import { LoansModule } from './loans/loans.module';
import { AuthModule } from './auth/auth.module';
import { SeedModule } from './seed/seed.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { AlertsModule } from './alerts/alerts.module';
import { TransferRequestsModule } from './transfer-requests/transfer-requests.module';
import { ReportsModule } from './reports/reports.module';
import { StockTakeModule } from './stock-take/stock-take.module';
import { EmailModule } from './email/email.module';
import { QrModule } from './qr/qr.module';
import { EventsModule } from './events/events.module';
import { SearchModule } from './common/search/search.module';

@Module({
  imports: [
    // Sentry must be first to capture all errors
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LoggerModule,
    // Rate limiting: 100 requests per minute per IP
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 second
        limit: 10, // 10 requests per second
      },
      {
        name: 'medium',
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests per minute
      },
      {
        name: 'long',
        ttl: 3600000, // 1 hour
        limit: 1000, // 1000 requests per hour
      },
    ]),
    ScheduleModule.forRoot(),
    // Cache configuration: 60 seconds TTL, max 100 items
    CacheModule.register({
      isGlobal: true,
      ttl: 60000, // 60 seconds
      max: 100, // maximum number of items in cache
    }),
    PrismaModule,
    EmailModule,
    QrModule,
    AuthModule,
    HealthModule,
    InventoryModule,
    WarehousesModule,
    SuppliersModule,
    CategoriesModule,
    UsersModule,
    TransactionsModule,
    LoansModule,
    SeedModule,
    AuditModule,
    AlertsModule,
    TransferRequestsModule,
    ReportsModule,
    StockTakeModule,
    EventsModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Sentry error filter (must be first)
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    // Apply throttling globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
