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
import {
  CreateScheduledReportDto,
  UpdateScheduledReportDto,
} from './dto/create-scheduled-report.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@ApiTags('scheduled-reports')
@Controller('scheduled-reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ScheduledReportsController {
  constructor(private readonly service: ScheduledReportsService) {}

  @Post()
  @Permissions('reports:export')
  create(
    @Body(ValidationPipe) dto: CreateScheduledReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user.userId);
  }

  @Get()
  @Permissions('reports:view')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAllForUser(user.userId);
  }

  @Patch(':id')
  @Permissions('reports:export')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: UpdateScheduledReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user.userId);
  }

  @Delete(':id')
  @Permissions('reports:export')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.softDelete(id, user.userId);
  }

  @Post(':id/send-now')
  @Permissions('reports:export')
  sendNow(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.sendNow(id, user.userId);
  }
}
