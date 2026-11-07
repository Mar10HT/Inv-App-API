import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BaseRepository, BaseRepositoryOptions } from '../common/repository';
import { apiError } from '../common/errors/api-error';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService extends BaseRepository<
  CreateServiceDto,
  UpdateServiceDto
> {
  protected readonly options: BaseRepositoryOptions = {
    modelName: 'service',
    defaultOrderBy: { name: 'asc' },
  };

  constructor(prisma: PrismaService, auditService: AuditService) {
    super(prisma, auditService);
  }

  /**
   * A service on a sale line can't be deleted (the line keeps it with
   * onDelete: Restrict). The database refuses with a foreign key error, which
   * would otherwise read as "a related record does not exist".
   */
  async remove(id: string, userId?: string): Promise<void> {
    try {
      await super.remove(id, userId);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        const found = await this.prisma.service.findUnique({
          where: { id },
          select: { name: true },
        });
        throw new ConflictException(
          apiError(
            'SERVICE_IN_USE',
            'This service is used on a sale or quotation and cannot be deleted',
            { name: found?.name ?? '' },
          ),
        );
      }
      throw error;
    }
  }
}
