import { Global, Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { StockLevelService } from './stock-level.service';
import { AlertsController } from './alerts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

// Global so every module that changes stock can inject StockLevelService.
@Global()
@Module({
  imports: [
    PrismaModule,
    EventsModule,
    PermissionsModule,
    PushNotificationsModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService, StockLevelService],
  exports: [AlertsService, StockLevelService],
})
export class AlertsModule {}
