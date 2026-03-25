import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ScheduledReportsService } from './scheduled-reports.service';
import { CreateScheduledReportDto, UpdateScheduledReportDto } from './dto/create-scheduled-report.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@ApiTags('scheduled-reports')
@Controller('scheduled-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ScheduledReportsController {
  constructor(private readonly service: ScheduledReportsService) {}

  @Post()
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  create(
    @Body(ValidationPipe) dto: CreateScheduledReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user.id);
  }

  @Get()
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAllForUser(user.id);
  }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: UpdateScheduledReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.softDelete(id, user.id);
  }

  @Post(':id/send-now')
  @Roles('SYSTEM_ADMIN')
  sendNow(@Param('id') id: string) {
    return this.service.sendNow(id);
  }
}
