import { Test, TestingModule } from '@nestjs/testing';
import { type AuditLog } from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: DeepMockProxy<PrismaService>;

  const mockAuditLog = {
    id: 'audit-123',
    action: 'CREATE',
    entity: 'InventoryItem',
    entityId: 'item-123',
    userId: 'user-123',
    changes: { after: { name: 'Test Item' } },
    createdAt: new Date(),
    user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
  } as unknown as AuditLog;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('log', () => {
    it('should create an audit log entry', async () => {
      prisma.auditLog.create.mockResolvedValue(mockAuditLog);

      const result = await service.log({
        action: 'CREATE',
        entity: 'InventoryItem',
        entityId: 'item-123',
        userId: 'user-123',
        changes: { after: { name: 'Test Item' } },
      });

      expect(result).toEqual(mockAuditLog);
      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'CREATE',
          entity: 'InventoryItem',
          entityId: 'item-123',
          userId: 'user-123',
          changes: { after: { name: 'Test Item' } },
        },
      });
    });

    it('should create audit log without changes', async () => {
      prisma.auditLog.create.mockResolvedValue({
        ...mockAuditLog,
        changes: null,
      });

      await service.log({
        action: 'DELETE',
        entity: 'InventoryItem',
        entityId: 'item-123',
        userId: 'user-123',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          action: 'DELETE',
          entity: 'InventoryItem',
          entityId: 'item-123',
          userId: 'user-123',
          changes: null,
        },
      });
    });

    it('should create audit log without userId', async () => {
      prisma.auditLog.create.mockResolvedValue({
        ...mockAuditLog,
        userId: null,
      });

      await service.log({
        action: 'CREATE',
        entity: 'InventoryItem',
        entityId: 'item-123',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        // jest's expect.objectContaining() return type is `any` in the
        // installed @types/jest — a known, long-standing typing gap.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          userId: undefined,
        }),
      });
    });
  });

  describe('getLogsForEntity', () => {
    it('should return logs for a specific entity', async () => {
      const logs = [mockAuditLog];
      prisma.auditLog.findMany.mockResolvedValue(logs);

      const result = await service.getLogsForEntity(
        'InventoryItem',
        'item-123',
      );

      expect(result).toEqual(logs);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          entity: 'InventoryItem',
          entityId: 'item-123',
        },
        take: 100,
        orderBy: { createdAt: 'desc' },
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
    });

    it('should return empty array when no logs found', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      const result = await service.getLogsForEntity(
        'InventoryItem',
        'nonexistent',
      );

      expect(result).toEqual([]);
    });
  });

  describe('getRecentLogs', () => {
    it('should return paginated logs with default limit', async () => {
      const logs = [mockAuditLog];
      prisma.auditLog.findMany.mockResolvedValue(logs);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = await service.getRecentLogs();

      expect(result).toEqual({
        data: logs,
        meta: { total: 1, limit: 50, offset: 0 },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          skip: 0,
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should return paginated logs with custom options', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const result = await service.getRecentLogs({
        limit: 10,
        offset: 5,
        action: 'CREATE',
      });

      expect(result).toEqual({
        data: [],
        meta: { total: 0, limit: 10, offset: 5 },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 5,
        }),
      );
    });
  });

  describe('getLogsByUser', () => {
    it('should return logs for a specific user', async () => {
      const logs = [mockAuditLog];
      prisma.auditLog.findMany.mockResolvedValue(logs);

      const result = await service.getLogsByUser('user-123');

      expect(result).toEqual(logs);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        take: 50,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return logs with custom limit', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);

      await service.getLogsByUser('user-123', 25);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        take: 25,
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
