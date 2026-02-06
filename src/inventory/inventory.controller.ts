import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { FilterInventoryDto } from './dto/filter-inventory.dto';
import { BulkUpdateDto, BulkDeleteDto, BulkImportDto } from './dto/bulk-operations.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  create(@Body(ValidationPipe) createInventoryDto: CreateInventoryDto) {
    return this.inventoryService.create(createInventoryDto);
  }

  @Get()
  findAll(@Query(ValidationPipe) filters: FilterInventoryDto) {
    return this.inventoryService.findAll(filters);
  }

  @Get('stats')
  getStats() {
    return this.inventoryService.getStats();
  }

  @Get('low-stock')
  getLowStockItems() {
    return this.inventoryService.getLowStockItems();
  }

  @Get('categories')
  getCategories() {
    return this.inventoryService.getCategories();
  }

  @Get('locations')
  getLocations() {
    return this.inventoryService.getLocations();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateInventoryDto: UpdateInventoryDto,
  ) {
    return this.inventoryService.update(id, updateInventoryDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  async remove(@Param('id') id: string) {
    await this.inventoryService.remove(id);
  }

  @Patch(':id/restore')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  restore(@Param('id') id: string) {
    return this.inventoryService.restore(id);
  }

  // Bulk Operations

  @Post('bulk-update')
  @HttpCode(HttpStatus.OK)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  bulkUpdate(
    @Body(ValidationPipe) dto: BulkUpdateDto,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.bulkUpdate(dto, user?.id);
  }

  @Delete('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @Roles('SYSTEM_ADMIN')
  bulkDelete(
    @Body(ValidationPipe) dto: BulkDeleteDto,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.bulkDelete(dto, user?.id);
  }

  @Post('bulk-import')
  @HttpCode(HttpStatus.CREATED)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  bulkImport(
    @Body(ValidationPipe) dto: BulkImportDto,
    @CurrentUser() user: any,
  ) {
    dto.createdById = user?.id;
    return this.inventoryService.bulkImport(dto);
  }

  @Post('bulk-import/excel')
  @HttpCode(HttpStatus.CREATED)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  @UseInterceptors(FileInterceptor('file'))
  async bulkImportExcel(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type. Only Excel files (.xlsx, .xls) are allowed');
    }

    const items = await this.inventoryService.parseExcelFile(file.buffer);

    if (items.length === 0) {
      throw new BadRequestException('No valid items found in the Excel file');
    }

    return this.inventoryService.bulkImport({
      items,
      createdById: user?.id,
    });
  }
}
