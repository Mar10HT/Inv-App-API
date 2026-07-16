import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import { PaginationDto } from '../common/dto';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@Controller('transactions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('transactions:create')
  create(
    @Body(ValidationPipe) createTransactionDto: CreateTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Validate user has access to at least one of the warehouses involved
    if (user.warehouseIds !== null) {
      const hasAccess =
        (createTransactionDto.sourceWarehouseId &&
          user.warehouseIds.includes(createTransactionDto.sourceWarehouseId)) ||
        (createTransactionDto.destinationWarehouseId &&
          user.warehouseIds.includes(
            createTransactionDto.destinationWarehouseId,
          ));
      if (!hasAccess) {
        throw new ForbiddenException(
          'You do not have access to the involved warehouses',
        );
      }
    }
    return this.transactionsService.create(createTransactionDto);
  }

  @Get()
  @Permissions('transactions:view')
  findAll(
    @Query(ValidationPipe) pagination: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transactionsService.findAll(pagination, user.warehouseIds);
  }

  @Get('recent')
  @Permissions('transactions:view')
  findRecent(
    @Query('limit') limit?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.transactionsService.findRecent(limitNum, user?.warehouseIds);
  }

  @Get(':id')
  @Permissions('transactions:view')
  findOne(@Param('id') id: string) {
    return this.transactionsService.findOne(id);
  }

  @Patch(':id')
  @Permissions('transactions:edit')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateTransactionDto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(id, updateTransactionDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('transactions:delete')
  async remove(@Param('id') id: string) {
    await this.transactionsService.remove(id);
  }
}
