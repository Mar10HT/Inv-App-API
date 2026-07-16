import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BaseRepository, BaseRepositoryOptions } from '../common/repository';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService extends BaseRepository<
  CreateSupplierDto,
  UpdateSupplierDto
> {
  protected readonly options: BaseRepositoryOptions = {
    modelName: 'supplier',
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

  constructor(prisma: PrismaService, auditService: AuditService) {
    super(prisma, auditService);
  }
}
