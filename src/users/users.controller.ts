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
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignWarehousesDto } from './dto/assign-warehouses.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';
import { PaginationDto } from '../common/dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
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
  create(
    @Body(ValidationPipe) createUserDto: CreateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.create(createUserDto, actor.userId);
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

  // Register or clear the Expo push token for the current user (no special permission needed)
  @Patch('push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  updatePushToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body(ValidationPipe) dto: UpdatePushTokenDto,
  ) {
    return this.usersService.updatePushToken(user.userId, dto.token);
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
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.update(id, updateUserDto, actor.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('users:delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.usersService.remove(id, actor.userId);
  }

  @Patch(':id/restore')
  @Permissions('users:delete')
  restore(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.restore(id, actor.userId);
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
