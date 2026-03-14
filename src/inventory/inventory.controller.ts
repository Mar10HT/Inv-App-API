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
  ForbiddenException,
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
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  create(
    @Body(ValidationPipe) createInventoryDto: CreateInventoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Validate user has access to the target warehouse
    if (user.warehouseIds !== null && !user.warehouseIds.includes(createInventoryDto.warehouseId)) {
      throw new ForbiddenException('You do not have access to this warehouse');
    }
    return this.inventoryService.create(createInventoryDto);
  }

  @Get()
  findAll(
    @Query(ValidationPipe) filters: FilterInventoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.findAll(filters, user.warehouseIds);
  }

  @Get('stats')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getStats(user.warehouseIds);
  }

  @Get('low-stock')
  getLowStockItems(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getLowStockItems(user.warehouseIds);
  }

  @Get('categories')
  getCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getCategories(user.warehouseIds);
  }

  @Get('locations')
  getLocations(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getLocations(user.warehouseIds);
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
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // If changing warehouse, validate access to target warehouse
    if (updateInventoryDto.warehouseId && user.warehouseIds !== null && !user.warehouseIds.includes(updateInventoryDto.warehouseId)) {
      throw new ForbiddenException('You do not have access to the target warehouse');
    }
    return this.inventoryService.update(id, updateInventoryDto, user.userId);
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
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.bulkUpdate(dto, user?.userId);
  }

  @Delete('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @Roles('SYSTEM_ADMIN')
  bulkDelete(
    @Body(ValidationPipe) dto: BulkDeleteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.bulkDelete(dto, user?.userId);
  }

  @Post('bulk-import')
  @HttpCode(HttpStatus.CREATED)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  bulkImport(
    @Body(ValidationPipe) dto: BulkImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    dto.createdById = user?.userId;
    return this.inventoryService.bulkImport(dto);
  }

  @Delete('reset-all')
  @HttpCode(HttpStatus.OK)
  @Roles('SYSTEM_ADMIN')
  async resetAll(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.resetAll(user?.userId);
  }

  @Post('bulk-import/excel')
  @HttpCode(HttpStatus.CREATED)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  @UseInterceptors(FileInterceptor('file'))
  async bulkImportExcel(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
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
      createdById: user?.userId,
    });
  }
}
