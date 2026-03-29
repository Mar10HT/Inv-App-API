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
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { PaginationDto } from '../common/dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions } from '../auth/decorators';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('suppliers:create')
  create(@Body(ValidationPipe) createSupplierDto: CreateSupplierDto) {
    return this.suppliersService.create(createSupplierDto);
  }

  @Get()
  @Permissions('suppliers:view')
  findAll(@Query(new ValidationPipe({ transform: true })) pagination: PaginationDto) {
    return this.suppliersService.findAll(pagination);
  }

  @Get(':id')
  @Permissions('suppliers:view')
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  @Permissions('suppliers:edit')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateSupplierDto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(id, updateSupplierDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('suppliers:delete')
  async remove(@Param('id') id: string) {
    await this.suppliersService.remove(id);
  }
}
