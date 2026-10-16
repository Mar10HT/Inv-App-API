import { Injectable, BadRequestException } from '@nestjs/common';
import type { CaiRange } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BaseRepository, BaseRepositoryOptions } from '../common/repository';
import { CreateCaiRangeDto } from './dto/create-cai-range.dto';
import { UpdateCaiRangeDto } from './dto/update-cai-range.dto';
import { toEndOfBusinessDay } from '../common/utils/date.util';
import { apiError } from '../common/errors/api-error';

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
      throw new BadRequestException(
        apiError(
          'CAI_RANGE_INVALID',
          'rangeEnd must be greater than rangeStart',
        ),
      );
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
      expiresAt: toEndOfBusinessDay(dto.expiresAt),
      currentNumber: dto.rangeStart,
    };
    return super.create(data, userId);
  }

  async update(
    id: string,
    dto: UpdateCaiRangeDto,
    userId?: string,
  ): Promise<CaiRange> {
    const current = await this.findOne(id);
    const rangeStart = dto.rangeStart ?? current.rangeStart;
    const rangeEnd = dto.rangeEnd ?? current.rangeEnd;
    this.assertValidRange(rangeStart, rangeEnd);
    // currentNumber is the next number to issue, so everything below it is
    // already printed on a sale: the start can't move once one was issued,
    // and the end can't drop below the last one issued.
    const issued = current.currentNumber > current.rangeStart;
    if (issued && rangeStart !== current.rangeStart) {
      throw new BadRequestException(
        apiError(
          'CAI_RANGE_IN_USE',
          'rangeStart cannot change once numbers were issued',
        ),
      );
    }
    if (rangeEnd < current.currentNumber - 1) {
      throw new BadRequestException(
        apiError(
          'CAI_RANGE_BELOW_ISSUED',
          'rangeEnd cannot be below the last issued number',
          { lastIssued: current.currentNumber - 1 },
        ),
      );
    }
    if (dto.isActive) {
      await this.deactivateOthers(id);
    }
    return super.update(
      id,
      {
        ...dto,
        ...(dto.expiresAt && {
          expiresAt: toEndOfBusinessDay(dto.expiresAt),
        }),
        ...(!issued &&
          dto.rangeStart !== undefined && { currentNumber: dto.rangeStart }),
      },
      userId,
    );
  }
}
