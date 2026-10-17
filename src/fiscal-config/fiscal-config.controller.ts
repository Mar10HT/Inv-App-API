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

  // Whoever writes sales or purchases needs the default tax rate to prefill
  // the form, so reading it isn't limited to the settings screen.
  @Get()
  @Permissions('settings:view', 'sales:create', 'purchases:create')
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
