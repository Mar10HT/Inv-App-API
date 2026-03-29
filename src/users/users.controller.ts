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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignWarehousesDto } from './dto/assign-warehouses.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { PaginationDto } from '../common/dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import { WarehouseAccessService } from '../common/warehouse-access/warehouse-access.service';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly warehouseAccessService: WarehouseAccessService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('users:create')
  create(@Body(ValidationPipe) createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @Permissions('users:view')
  findAll(@Query(new ValidationPipe({ transform: true })) pagination: PaginationDto) {
    return this.usersService.findAll(pagination);
  }

  // Notification preferences - accessible to ALL authenticated users (no @Permissions required)
  @Get('preferences')
  getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getPreferences(user.userId);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body(ValidationPipe) prefs: UpdatePreferencesDto,
  ) {
    return this.usersService.updatePreferences(user.userId, prefs);
  }

  @Get(':id')
  @Permissions('users:view')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Permissions('users:edit')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('users:delete')
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
  }

  @Patch(':id/restore')
  @Permissions('users:delete')
  restore(@Param('id') id: string) {
    return this.usersService.restore(id);
  }

  // Warehouse access management

  @Get(':id/warehouses')
  @Permissions('users:view')
  getUserWarehouses(@Param('id') id: string) {
    return this.warehouseAccessService.getUserWarehouses(id);
  }

  @Post(':id/warehouses')
  @HttpCode(HttpStatus.OK)
  @Permissions('users:edit')
  async assignWarehouses(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: AssignWarehousesDto,
  ) {
    await this.warehouseAccessService.setUserWarehouses(id, dto.warehouseIds);
    return this.warehouseAccessService.getUserWarehouses(id);
  }
}
