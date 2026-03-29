import { Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
