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
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto, ReturnLoanDto } from './dto/update-loan.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import { PaginationDto } from '../common/dto';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@Controller('loans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('loans:create')
  create(
    @Body(ValidationPipe) createLoanDto: CreateLoanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Validate user has access to at least one of the warehouses involved
    if (user.warehouseIds !== null) {
      const hasAccess =
        user.warehouseIds.includes(createLoanDto.sourceWarehouseId) ||
        user.warehouseIds.includes(createLoanDto.destinationWarehouseId);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to the involved warehouses');
      }
    }
    return this.loansService.create(createLoanDto, user.userId);
  }

  @Get()
  @Permissions('loans:view')
  findAll(
    @Query(ValidationPipe) pagination: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.findAll(pagination, user.warehouseIds);
  }

  @Get('active')
  @Permissions('loans:view')
  findActive(@CurrentUser() user: AuthenticatedUser) {
    return this.loansService.findActive(user.warehouseIds);
  }

  @Get('stats')
  @Permissions('loans:view')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.loansService.getStats(user.warehouseIds);
  }

  @Get('item/:itemId')
  @Permissions('loans:view')
  findByItem(@Param('itemId') itemId: string) {
    return this.loansService.findByItem(itemId);
  }

  @Get('warehouse/:warehouseId')
  @Permissions('loans:view')
  findByWarehouse(@Param('warehouseId') warehouseId: string) {
    return this.loansService.findByWarehouse(warehouseId);
  }

  @Get('check-item/:itemId')
  @Permissions('loans:view')
  async isItemOnLoan(@Param('itemId') itemId: string) {
    const onLoan = await this.loansService.isItemOnLoan(itemId);
    return { onLoan };
  }

  @Get(':id')
  @Permissions('loans:view')
  findOne(@Param('id') id: string) {
    return this.loansService.findOne(id);
  }

  // ==================== QR Code Endpoints ====================

  @Patch(':id/send')
  @Permissions('loans:manage')
  sendLoan(@Param('id') id: string) {
    return this.loansService.sendLoan(id);
  }

  @Get(':id/qr/:type')
  @Permissions('loans:manage')
  async getQrCode(
    @Param('id') id: string,
    @Param('type') type: 'send' | 'return',
  ) {
    const qrDataUrl = await this.loansService.getQrCode(id, type);
    return { qrDataUrl };
  }

  @Post('confirm-receipt')
  @HttpCode(HttpStatus.OK)
  @Permissions('loans:manage')
  confirmReceipt(
    @Body('qrCode') qrCode: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.confirmReceipt(qrCode, user.userId);
  }

  @Patch(':id/initiate-return')
  @Permissions('loans:manage')
  initiateReturn(@Param('id') id: string) {
    return this.loansService.initiateReturn(id);
  }

  @Post('confirm-return')
  @HttpCode(HttpStatus.OK)
  @Permissions('loans:manage')
  confirmReturn(
    @Body('qrCode') qrCode: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.confirmReturn(qrCode, user.userId);
  }

  @Post('scan-qr')
  @HttpCode(HttpStatus.OK)
  @Permissions('loans:manage')
  scanQr(
    @Body('scannedData') scannedData: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.processQrCode(scannedData, user.userId);
  }

  // ==================== Standard Endpoints ====================

  @Patch(':id')
  @Permissions('loans:manage')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateLoanDto: UpdateLoanDto,
  ) {
    return this.loansService.update(id, updateLoanDto);
  }

  @Patch(':id/return')
  @Permissions('loans:manage')
  returnLoan(
    @Param('id') id: string,
    @Body(ValidationPipe) returnLoanDto: ReturnLoanDto,
  ) {
    return this.loansService.returnLoan(id, returnLoanDto);
  }

  @Patch(':id/cancel')
  @Permissions('loans:manage')
  cancelLoan(@Param('id') id: string) {
    return this.loansService.cancel(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('loans:delete')
  async remove(@Param('id') id: string) {
    await this.loansService.remove(id);
  }

  @Post('check-overdue')
  @Permissions('loans:manage')
  async checkOverdueLoans() {
    await this.loansService.checkOverdueLoans();
    return { message: 'Overdue loans checked and updated' };
  }
}
