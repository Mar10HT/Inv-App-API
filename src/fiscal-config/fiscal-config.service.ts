import { Injectable } from '@nestjs/common';
import type { FiscalConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateFiscalConfigDto } from './dto/update-fiscal-config.dto';

// Single-row table: no BaseRepository here, there's no list/paginate
// semantics for a singleton, just get-or-create and update.
@Injectable()
export class FiscalConfigService {
  private static readonly AUDIT_FIELD_DENYLIST = /^(id|createdAt|updatedAt)$/;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async get(): Promise<FiscalConfig> {
    const existing = await this.prisma.fiscalConfig.findFirst();
    if (existing) return existing;
    // Schema @default values (currency: HNL, isvPercent: 15) apply here.
    return this.prisma.fiscalConfig.create({ data: {} });
  }

  async update(
    dto: UpdateFiscalConfigDto,
    userId?: string,
  ): Promise<FiscalConfig> {
    const before = await this.get();

    const entity = await this.prisma.fiscalConfig.update({
      where: { id: before.id },
      data: dto,
    });

    this.auditService.logSafe({
      action: 'UPDATE',
      entity: 'FiscalConfig',
      entityId: before.id,
      userId,
      changes: {
        before: this.summarize(before),
        after: this.summarize(entity),
        fields: Object.keys(dto),
      },
    });

    return entity;
  }

  private summarize(entity: FiscalConfig): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(entity)) {
      if (FiscalConfigService.AUDIT_FIELD_DENYLIST.test(key)) continue;
      out[key] = value;
    }
    return out;
  }
}
