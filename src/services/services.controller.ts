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
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { PaginationDto } from '../common/dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@Controller('services')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('services:create')
  create(
    @Body(ValidationPipe) createServiceDto: CreateServiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.servicesService.create(createServiceDto, user.userId);
  }

  @Get()
  @Permissions('services:view')
  findAll(
    @Query(new ValidationPipe({ transform: true })) pagination: PaginationDto,
  ) {
    return this.servicesService.findAll(pagination);
  }

  @Get(':id')
  @Permissions('services:view')
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Patch(':id')
  @Permissions('services:edit')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateServiceDto: UpdateServiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.servicesService.update(id, updateServiceDto, user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('services:delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.servicesService.remove(id, user.userId);
  }
}
