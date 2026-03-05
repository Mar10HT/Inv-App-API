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
import { PaginationDto } from '../common/dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import { WarehouseAccessService } from '../common/warehouse-access/warehouse-access.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SYSTEM_ADMIN') // Only admins can manage users
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly warehouseAccessService: WarehouseAccessService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(ValidationPipe) createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll(@Query(new ValidationPipe({ transform: true })) pagination: PaginationDto) {
    return this.usersService.findAll(pagination);
  }

  // Notification preferences - accessible to ALL authenticated users
  @Get('preferences')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER', 'VIEWER', 'EXTERNAL')
  getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getPreferences(user.userId);
  }

  @Patch('preferences')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER', 'VIEWER', 'EXTERNAL')
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() prefs: { emailNotifications?: boolean; lowStockAlerts?: boolean },
  ) {
    return this.usersService.updatePreferences(user.userId, prefs);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.usersService.remove(id);
  }

  @Patch(':id/restore')
  restore(@Param('id') id: string) {
    return this.usersService.restore(id);
  }

  // Warehouse access management

  @Get(':id/warehouses')
  getUserWarehouses(@Param('id') id: string) {
    return this.warehouseAccessService.getUserWarehouses(id);
  }

  @Post(':id/warehouses')
  @HttpCode(HttpStatus.OK)
  async assignWarehouses(
    @Param('id') id: string,
    @Body('warehouseIds') warehouseIds: string[],
  ) {
    await this.warehouseAccessService.setUserWarehouses(id, warehouseIds);
    return this.warehouseAccessService.getUserWarehouses(id);
  }
}
