import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'LOGIN' | 'LOGOUT' | 'PASSWORD_CHANGE';

export interface AuditLogData {
  action: AuditAction;
  entity: string;
  entityId: string;
  userId?: string;
  changes?: {
    before?: any;
    after?: any;
    fields?: string[];
  };
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(data: AuditLogData) {
    return this.prisma.auditLog.create({
      data: {
        action: data.action,
        entity: data.entity,
        entityId: data.entityId,
        userId: data.userId,
        changes: data.changes ? JSON.parse(JSON.stringify(data.changes)) : null,
      },
    });
  }

  async getLogsForEntity(entity: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        entity,
        entityId,
      },
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

    const where: any = {};
    if (options?.action) {
      where.action = options.action;
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
