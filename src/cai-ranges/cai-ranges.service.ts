import { Injectable, BadRequestException } from '@nestjs/common';
import type { CaiRange } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BaseRepository, BaseRepositoryOptions } from '../common/repository';
import { CreateCaiRangeDto } from './dto/create-cai-range.dto';
import { UpdateCaiRangeDto } from './dto/update-cai-range.dto';

@Injectable()
export class CaiRangesService extends BaseRepository<
  CreateCaiRangeDto,
  UpdateCaiRangeDto,
  CaiRange
> {
  protected readonly options: BaseRepositoryOptions = {
    modelName: 'caiRange',
    defaultOrderBy: { createdAt: 'desc' },
  };

  constructor(prisma: PrismaService, auditService: AuditService) {
    super(prisma, auditService);
  }

  private assertValidRange(rangeStart?: number, rangeEnd?: number): void {
    if (
      rangeStart !== undefined &&
      rangeEnd !== undefined &&
      rangeEnd <= rangeStart
    ) {
      throw new BadRequestException('rangeEnd must be greater than rangeStart');
    }
  }

  // Keeps the "at most one active range" invariant: activating a range
  // deactivates every other one. A sequential updateMany + create/update is
  // enough here (low-concurrency admin action), unlike the numbering
  // consumption a later phase adds, which does need row locking.
  private async deactivateOthers(excludeId?: string): Promise<void> {
    await this.prisma.caiRange.updateMany({
      where: excludeId
        ? { isActive: true, id: { not: excludeId } }
        : { isActive: true },
      data: { isActive: false },
    });
  }

  async create(dto: CreateCaiRangeDto, userId?: string): Promise<CaiRange> {
    this.assertValidRange(dto.rangeStart, dto.rangeEnd);
    if (dto.isActive) {
      await this.deactivateOthers();
    }
    const data: CreateCaiRangeDto & { currentNumber: number } = {
      ...dto,
      currentNumber: dto.rangeStart,
    };
    return super.create(data, userId);
  }

  async update(
    id: string,
    dto: UpdateCaiRangeDto,
    userId?: string,
  ): Promise<CaiRange> {
    this.assertValidRange(dto.rangeStart, dto.rangeEnd);
    if (dto.isActive) {
      await this.deactivateOthers(id);
    }
    return super.update(id, dto, userId);
  }
}
