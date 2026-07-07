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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { FilterInventoryDto } from './dto/filter-inventory.dto';
import {
  BulkUpdateDto,
  BulkDeleteDto,
  BulkImportDto,
} from './dto/bulk-operations.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@Controller('inventory')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('inventory:create')
  create(
    @Body(ValidationPipe) createInventoryDto: CreateInventoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Validate user has access to the target warehouse
    if (
      user.warehouseIds !== null &&
      !user.warehouseIds.includes(createInventoryDto.warehouseId)
    ) {
      throw new ForbiddenException('You do not have access to this warehouse');
    }
    createInventoryDto.createdById = user.userId;
    return this.inventoryService.create(createInventoryDto);
  }

  @Get()
  @Permissions('inventory:view')
  findAll(
    @Query(ValidationPipe) filters: FilterInventoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.findAll(filters, user.warehouseIds);
  }

  @Get('stats')
  @Permissions('inventory:view')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getStats(user.warehouseIds);
  }

  @Get('low-stock')
  @Permissions('inventory:view')
  getLowStockItems(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getLowStockItems(user.warehouseIds);
  }

  @Get('categories')
  @Permissions('inventory:view')
  getCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getCategories(user.warehouseIds);
  }

  @Get('locations')
  @Permissions('inventory:view')
  getLocations(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.getLocations(user.warehouseIds);
  }

  @Get('import-template')
  @Permissions('inventory:export')
  async downloadImportTemplate(@Res() res: Response) {
    const buffer = await this.inventoryService.generateImportTemplate();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        'attachment; filename="plantilla-importacion.xlsx"',
    });
    res.send(buffer);
  }

  @Get(':id')
  @Permissions('inventory:view')
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Patch(':id')
  @Permissions('inventory:edit')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateInventoryDto: UpdateInventoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // If changing warehouse, validate access to target warehouse
    if (
      updateInventoryDto.warehouseId &&
      user.warehouseIds !== null &&
      !user.warehouseIds.includes(updateInventoryDto.warehouseId)
    ) {
      throw new ForbiddenException(
        'You do not have access to the target warehouse',
      );
    }
    return this.inventoryService.update(id, updateInventoryDto, user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('inventory:delete')
  async remove(@Param('id') id: string) {
    await this.inventoryService.remove(id);
  }

  @Patch(':id/restore')
  @Permissions('inventory:edit')
  restore(@Param('id') id: string) {
    return this.inventoryService.restore(id);
  }

  // Bulk Operations

  @Post('bulk-update')
  @HttpCode(HttpStatus.OK)
  @Permissions('inventory:edit')
  bulkUpdate(
    @Body(ValidationPipe) dto: BulkUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.bulkUpdate(dto, user?.userId);
  }

  @Delete('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @Permissions('inventory:delete')
  bulkDelete(
    @Body(ValidationPipe) dto: BulkDeleteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.inventoryService.bulkDelete(dto, user?.userId);
  }

  @Post('bulk-import')
  @HttpCode(HttpStatus.CREATED)
  @Permissions('inventory:create')
  bulkImport(
    @Body(ValidationPipe) dto: BulkImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    dto.createdById = user?.userId;
    return this.inventoryService.bulkImport(dto);
  }

  @Delete('reset-all')
  @HttpCode(HttpStatus.OK)
  @Permissions('inventory:delete')
  async resetAll(@CurrentUser() user: AuthenticatedUser) {
    return this.inventoryService.resetAll(user?.userId);
  }

  @Post('bulk-import/excel')
  @HttpCode(HttpStatus.CREATED)
  @Permissions('inventory:create')
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
      throw new BadRequestException(
        'Invalid file type. Only Excel files (.xlsx, .xls) are allowed',
      );
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
