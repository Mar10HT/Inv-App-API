import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'RESTORE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'ACCESS';

export interface AuditLogData {
  action: AuditAction;
  entity: string;
  entityId: string;
  userId?: string;
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

  constructor(private prisma: PrismaService) {}

  async log(data: AuditLogData) {
    return this.prisma.auditLog.create({
      data: {
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        userId: data.userId,
        changes: data.changes
          ? (JSON.parse(JSON.stringify(data.changes)) as Prisma.InputJsonValue)
          : null,
      },
    });
  }

  /**
   * Fire-and-forget audit log. Failures are logged at warn level (with the
   * action/entity for triage) and otherwise swallowed — a broken audit write
   * must never poison a successful business mutation. Use this from service
   * code instead of `.catch(() => undefined)` so production failures stay
   * observable instead of vanishing silently.
   */
  logSafe(data: AuditLogData): void {
    this.log(data).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `audit log failed for ${data.action} ${data.entity}:${data.entityId} — ${message}`,
      );
    });
  }

  async getLogsForEntity(
    entity: string,
    entityId: string,
    limit: number = 100,
  ) {
    return this.prisma.auditLog.findMany({
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

  /**
   * Business-mutation actions surfaced by default in the audit listing.
   * Auth/access events (LOGIN/LOGOUT/PASSWORD_CHANGE/ACCESS) are hidden
   * unless the caller passes `action` explicitly, because the SYSTEM_ADMIN
   * bypass and login flow generate enough of them to drown out real changes
   * in the default view.
   */
  private static readonly DEFAULT_VISIBLE_ACTIONS = [
    'CREATE',
    'UPDATE',
    'DELETE',
    'RESTORE',
  ];

  async getRecentLogs(options?: {
    limit?: number;
    offset?: number;
    action?: string;
    entity?: string;
  }) {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const where: Prisma.AuditLogWhereInput = {};
    if (options?.action) {
      where.action = options.action;
    } else {
      where.action = { in: AuditService.DEFAULT_VISIBLE_ACTIONS };
    }
    if (options?.entity) {
      where.entity = options.entity;
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
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
      this.prisma.auditLog.count({ where }),
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
    return this.prisma.auditLog.findMany({
      where: { userId },
      take: limit,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
