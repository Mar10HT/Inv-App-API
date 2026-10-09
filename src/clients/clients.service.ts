import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Client } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BaseRepository, BaseRepositoryOptions } from '../common/repository';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@Injectable()
export class ClientsService extends BaseRepository<
  CreateClientDto,
  UpdateClientDto,
  Client
> {
  protected readonly options: BaseRepositoryOptions = {
    modelName: 'client',
    defaultOrderBy: { createdAt: 'desc' },
    // Soft-deleted clients must stop appearing everywhere a later phase
    // (Sale.clientId) relies on an active client list.
    defaultWhere: { deletedAt: null },
  };

  constructor(prisma: PrismaService, auditService: AuditService) {
    super(prisma, auditService);
  }

  // Overridden: `code` has no DB-level @unique (see the schema comment — a
  // real unique constraint would also cover soft-deleted rows, permanently
  // blocking reuse of a deleted client's code). Uniqueness only has to hold
  // among active clients, checked here instead.
  async create(dto: CreateClientDto, userId?: string): Promise<Client> {
    const conflict = await this.prisma.client.findFirst({
      where: { code: dto.code, deletedAt: null },
    });
    if (conflict) {
      throw new ConflictException(
        `A client with code "${dto.code}" already exists`,
      );
    }
    return super.create(dto, userId);
  }

  async update(
    id: string,
    dto: UpdateClientDto,
    userId?: string,
  ): Promise<Client> {
    if (dto.code !== undefined) {
      const conflict = await this.prisma.client.findFirst({
        where: { code: dto.code, deletedAt: null, id: { not: id } },
      });
      if (conflict) {
        throw new ConflictException(
          `A client with code "${dto.code}" already exists`,
        );
      }
    }
    return super.update(id, dto, userId);
  }

  // Overridden: BaseRepository.remove() does a real delete. A client must be
  // soft-deleted so a later phase can safely keep Sale.clientId pointing at
  // it without losing history.
  async remove(id: string, userId?: string): Promise<void> {
    const before = await this.prisma.client.findUnique({ where: { id } });
    if (!before || before.deletedAt) {
      throw new NotFoundException(`client with ID ${id} not found`);
    }

    try {
      await this.prisma.client.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`client with ID ${id} not found`);
      }
      throw error;
    }

    this.auditService.logSafe({
      action: 'DELETE',
      entity: 'Client',
      entityId: id,
      userId,
      changes: { before: this.summarizeForAudit(before) },
    });
  }
}
