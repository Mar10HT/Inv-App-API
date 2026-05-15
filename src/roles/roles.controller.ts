import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@ApiTags('roles')
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('settings:edit')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /** All permissions grouped by module — used by role form UI. */
  @Get('permissions')
  getAllPermissions() {
    return this.rolesService.getAllPermissions();
  }

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(ValidationPipe) dto: CreateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rolesService.create(dto, actor.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: UpdateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rolesService.update(id, dto, actor.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rolesService.remove(id, actor.userId);
  }
}
