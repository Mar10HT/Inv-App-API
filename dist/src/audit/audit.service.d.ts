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
export declare class AuditService {
    private prisma;
    constructor(prisma: PrismaService);
    log(data: AuditLogData): Promise<{
        id: string;
        action: string;
        entity: string;
        entityId: string;
        changes: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        userId: string | null;
        itemId: string | null;
    }>;
    getLogsForEntity(entity: string, entityId: string): Promise<({
        user: {
            id: string;
            name: string | null;
            email: string;
        } | null;
    } & {
        id: string;
        action: string;
        entity: string;
        entityId: string;
        changes: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        userId: string | null;
        itemId: string | null;
    })[]>;
    getRecentLogs(limit?: number): Promise<({
        user: {
            id: string;
            name: string | null;
            email: string;
        } | null;
    } & {
        id: string;
        action: string;
        entity: string;
        entityId: string;
        changes: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        userId: string | null;
        itemId: string | null;
    })[]>;
    getLogsByUser(userId: string, limit?: number): Promise<{
        id: string;
        action: string;
        entity: string;
        entityId: string;
        changes: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        userId: string | null;
        itemId: string | null;
    }[]>;
}
