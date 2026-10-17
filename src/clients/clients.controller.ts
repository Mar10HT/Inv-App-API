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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PaginationDto } from '../common/dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@Controller('clients')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('clients:create')
  create(
    @Body(ValidationPipe) createClientDto: CreateClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.create(createClientDto, user.userId);
  }

  @Get()
  @Permissions('clients:view')
  findAll(
    @Query(new ValidationPipe({ transform: true })) pagination: PaginationDto,
  ) {
    return this.clientsService.findAll(pagination);
  }

  @Get(':id')
  @Permissions('clients:view')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  @Permissions('clients:edit')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateClientDto: UpdateClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clientsService.update(id, updateClientDto, user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('clients:delete')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.clientsService.remove(id, user.userId);
  }
}
