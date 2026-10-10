import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CancelPaymentDto } from './dto/cancel-payment.dto';
import { FilterPaymentDto } from './dto/filter-payment.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('payments:create')
  create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreatePaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.create(dto, user.userId, user.warehouseIds);
  }

  @Get()
  @Permissions('payments:view')
  findAll(
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    filters: FilterPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.findAll(filters, user.warehouseIds);
  }

  @Get('stats')
  @Permissions('payments:view')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.getStats(user.warehouseIds);
  }

  @Get(':id')
  @Permissions('payments:view')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.findOne(id, user.warehouseIds);
  }

  @Patch(':id/cancel')
  @Permissions('payments:cancel')
  cancel(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: CancelPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentsService.cancel(
      id,
      user.userId,
      dto.reason,
      user.warehouseIds,
    );
  }
}
