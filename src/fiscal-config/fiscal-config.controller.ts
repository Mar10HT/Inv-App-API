import {
  Controller,
  Get,
  Patch,
  Body,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { FiscalConfigService } from './fiscal-config.service';
import { UpdateFiscalConfigDto } from './dto/update-fiscal-config.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@Controller('fiscal-config')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FiscalConfigController {
  constructor(private readonly fiscalConfigService: FiscalConfigService) {}

  @Get()
  @Permissions('settings:view')
  get() {
    return this.fiscalConfigService.get();
  }

  @Patch()
  @Permissions('settings:edit')
  update(
    @Body(ValidationPipe) updateFiscalConfigDto: UpdateFiscalConfigDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.fiscalConfigService.update(updateFiscalConfigDto, user.userId);
  }
}
