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
import { CaiRangesService } from './cai-ranges.service';
import { CreateCaiRangeDto } from './dto/create-cai-range.dto';
import { UpdateCaiRangeDto } from './dto/update-cai-range.dto';
import { PaginationDto } from '../common/dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@Controller('cai-ranges')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CaiRangesController {
  constructor(private readonly caiRangesService: CaiRangesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('settings:edit')
  create(
    @Body(ValidationPipe) createCaiRangeDto: CreateCaiRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.caiRangesService.create(createCaiRangeDto, user.userId);
  }

  @Get()
  @Permissions('settings:view')
  findAll(
    @Query(new ValidationPipe({ transform: true })) pagination: PaginationDto,
  ) {
    return this.caiRangesService.findAll(pagination);
  }

  @Get(':id')
  @Permissions('settings:view')
  findOne(@Param('id') id: string) {
    return this.caiRangesService.findOne(id);
  }

  @Patch(':id')
  @Permissions('settings:edit')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateCaiRangeDto: UpdateCaiRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.caiRangesService.update(id, updateCaiRangeDto, user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('settings:edit')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.caiRangesService.remove(id, user.userId);
  }
}
