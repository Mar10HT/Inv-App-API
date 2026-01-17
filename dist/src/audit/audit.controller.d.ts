import { AuditService } from './audit.service';
export declare class AuditController {
    private readonly auditService;
    constructor(auditService: AuditService);
    getRecentLogs(limit?: string): Promise<({
        user: {
            id: string;
            email: string;
            name: string | null;
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
    getLogsForEntity(entity: string, entityId: string): Promise<({
        user: {
            id: string;
            email: string;
            name: string | null;
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
    getLogsByUser(userId: string, limit?: string): Promise<{
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
