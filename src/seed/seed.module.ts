import { Module } from '@nestjs/common';
import { SeedController } from './seed.controller';
import { PermissionsSeedService } from './permissions-seed.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SeedController],
  providers: [PermissionsSeedService],
})
export class SeedModule {}
