import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BaseRepository, BaseRepositoryOptions } from '../common/repository';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

@Injectable()
export class WarehousesService extends BaseRepository<CreateWarehouseDto, UpdateWarehouseDto> {
  protected readonly options: BaseRepositoryOptions = {
    modelName: 'warehouse',
    defaultOrderBy: { createdAt: 'desc' },
    findAllInclude: {
      _count: {
        select: {
          inventoryItems: true,
        },
      },
    },
    findOneInclude: {
      inventoryItems: true,
      _count: {
        select: {
          inventoryItems: true,
        },
      },
    },
  };

  constructor(prisma: PrismaService) {
    super(prisma);
  }
}
