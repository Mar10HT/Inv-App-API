import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SYSTEM_ADMIN') // Only admins can view audit logs
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  getRecentLogs(@Query('limit') limit?: string) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.auditService.getRecentLogs(limitNum);
  }

  @Get('entity/:entity/:entityId')
  getLogsForEntity(
    @Param('entity') entity: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditService.getLogsForEntity(entity, entityId);
  }

  @Get('user/:userId')
  getLogsByUser(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.auditService.getLogsByUser(userId, limitNum);
  }
}
