import { Module } from '@nestjs/common';
import { SeedController } from './seed.controller';
import { PermissionsSeedService } from './permissions-seed.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [SeedController],
  providers: [PermissionsSeedService],
})
export class SeedModule {}
