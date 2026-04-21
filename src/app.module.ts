import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as Joi from 'joi';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerModule } from './logger';
import { PrismaModule } from './prisma/prisma.module';
import { CsrfModule } from './csrf/csrf.module';
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
import { DischargeRequestsModule } from './discharge-requests/discharge-requests.module';
import { WarehouseAccessModule } from './common/warehouse-access/warehouse-access.module';
import { WarehouseAccessInterceptor } from './common/warehouse-access/warehouse-access.interceptor';
import { ScheduledReportsModule } from './scheduled-reports/scheduled-reports.module';
import { RolesModule } from './roles/roles.module';
import { ClsModule } from 'nestjs-cls';
import { TenantModule } from './tenant/tenant.module';
import { OrganizationsModule } from './organizations/organizations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema: Joi.object({
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        PORT: Joi.number().default(3000),
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_EXPIRES_IN: Joi.string().default('15m'),
        CORS_ORIGIN: Joi.string().default('http://localhost:4200'),
        FRONTEND_URL: Joi.string().default('http://localhost:4200'),
        // SMTP — required only when email is configured
        SMTP_HOST: Joi.string().optional(),
        SMTP_PORT: Joi.number().default(587),
        SMTP_USER: Joi.string().optional(),
        SMTP_PASS: Joi.string().optional(),
        SMTP_FROM: Joi.string().optional(),
        // Admin seed — required in production if DB is empty
        ADMIN_EMAIL: Joi.string().email().optional(),
        ADMIN_PASSWORD: Joi.string().min(12).optional(),
        // Multi-tenant (Phase 0 — off by default)
        MULTI_TENANT_ENABLED: Joi.boolean().default(false),
        TENANT_WAREHOUSE_CACHE_TTL_MS: Joi.number().integer().min(0).default(45000),
        TENANT_WAREHOUSE_CACHE_MAX: Joi.number().integer().min(1).default(5000),
        SUPER_ADMIN_IMPERSONATION_MAX_MIN: Joi.number().integer().min(1).default(30),
        DEFAULT_ORG_SLUG: Joi.string().default('ON'),
        DEFAULT_ORG_NAME: Joi.string().default('Olancho Net'),
      }),
      validationOptions: {
        abortEarly: false, // Report all missing vars at once
      },
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
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
    }),
    TenantModule,
    OrganizationsModule,
    // Cache configuration: 60 seconds TTL, max 100 items
    CacheModule.register({
      isGlobal: true,
      ttl: 60000, // 60 seconds
      max: 100, // maximum number of items in cache
    }),
    PrismaModule,
    CsrfModule,
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
    DischargeRequestsModule,
    WarehouseAccessModule,
    ScheduledReportsModule,
    RolesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Apply throttling globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Resolve warehouse access for authenticated users
    {
      provide: APP_INTERCEPTOR,
      useClass: WarehouseAccessInterceptor,
    },
  ],
})
export class AppModule {}
