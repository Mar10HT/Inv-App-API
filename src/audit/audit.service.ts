import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantFlagService } from '../tenant/tenant-flag.service';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'LOGIN' | 'LOGOUT' | 'PASSWORD_CHANGE' | 'ACCESS';

export interface AuditLogData {
  action: AuditAction;
  entity: string;
  entityId: string;
  userId?: string;
  /**
   * Explicit org binding. Optional when the call originates from an
   * authenticated request (the CLS context provides one). REQUIRED for
   * public/cron paths where no CLS scope exists.
   */
  organizationId?: string;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    fields?: string[];
  };
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private prisma: PrismaService,
    private tenantContext: TenantContextService,
    private flag: TenantFlagService,
  ) {}

  async log(data: AuditLogData) {
    // Resolve organizationId: explicit > CLS context > undefined.
    const organizationId =
      data.organizationId ?? this.tenantContext.getOrgId();

    if (!organizationId) {
      // The audit_logs.organizationId column is NOT NULL since Phase 1.5.
      // Without one we cannot write. When the multi-tenant flag is off we
      // tolerate this (legacy behavior, dev paths) and skip the write with
      // a warning rather than breaking the caller. When the flag is on,
      // missing org is a bug that must surface loudly.
      if (this.flag.isEnabled()) {
        throw new InternalServerErrorException(
          `AuditService.log requires organizationId (CLS context or explicit param) for ${data.entity}/${data.action}`,
        );
      }
      this.logger.warn(
        `Skipping audit entry without organizationId: ${data.entity}/${data.action}`,
      );
      return null;
    }

    return this.prisma.auditLog.create({
      data: {
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        userId: data.userId,
        changes: data.changes ? JSON.parse(JSON.stringify(data.changes)) : null,
        organizationId,
      },
    });
  }

  async getLogsForEntity(entity: string, entityId: string, limit: number = 100) {
    return this.prisma.tenant().auditLog.findMany({
      where: {
        entity,
        entityId,
      },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async getRecentLogs(options?: { limit?: number; offset?: number; action?: string; entity?: string }) {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const where: Prisma.AuditLogWhereInput = {};
    if (options?.action) {
      where.action = options.action;
    }
    if (options?.entity) {
      where.entity = options.entity;
    }

    const [data, total] = await Promise.all([
      this.prisma.tenant().auditLog.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.tenant().auditLog.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        limit,
        offset,
      },
    };
  }

  async getLogsByUser(userId: string, limit: number = 50) {
    return this.prisma.tenant().auditLog.findMany({
      where: { userId },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
