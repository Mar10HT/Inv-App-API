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
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto, ReturnLoanDto } from './dto/update-loan.dto';

@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(ValidationPipe) createLoanDto: CreateLoanDto) {
    return this.loansService.create(createLoanDto);
  }

  @Get()
  findAll() {
    return this.loansService.findAll();
  }

  @Get('active')
  findActive() {
    return this.loansService.findActive();
  }

  @Get('stats')
  getStats() {
    return this.loansService.getStats();
  }

  @Get('item/:itemId')
  findByItem(@Param('itemId') itemId: string) {
    return this.loansService.findByItem(itemId);
  }

  @Get('warehouse/:warehouseId')
  findByWarehouse(@Param('warehouseId') warehouseId: string) {
    return this.loansService.findByWarehouse(warehouseId);
  }

  @Get('check-item/:itemId')
  async isItemOnLoan(@Param('itemId') itemId: string) {
    const onLoan = await this.loansService.isItemOnLoan(itemId);
    return { onLoan };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.loansService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateLoanDto: UpdateLoanDto,
  ) {
    return this.loansService.update(id, updateLoanDto);
  }

  @Patch(':id/return')
  returnLoan(
    @Param('id') id: string,
    @Body(ValidationPipe) returnLoanDto: ReturnLoanDto,
  ) {
    return this.loansService.returnLoan(id, returnLoanDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.loansService.remove(id);
  }

  @Post('check-overdue')
  async checkOverdueLoans() {
    await this.loansService.checkOverdueLoans();
    return { message: 'Overdue loans checked and updated' };
  }
}
