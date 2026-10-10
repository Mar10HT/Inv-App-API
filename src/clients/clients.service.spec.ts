import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, type Client } from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { ClientsService } from './clients.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('test error', {
    code,
    clientVersion: '6.x',
  });

describe('ClientsService', () => {
  let service: ClientsService;
  let prisma: DeepMockProxy<PrismaService>;
  let auditService: { logSafe: jest.Mock };

  const mockClient = {
    id: 'client-123',
    code: 'CLI-001',
    name: 'Test Client',
    rtn: null,
    phone: null,
    paymentCondition: 'CASH',
    creditLimit: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as unknown as Client;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    auditService = { logSafe: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('creates a client', async () => {
      prisma.client.findFirst.mockResolvedValue(null);
      prisma.client.create.mockResolvedValue(mockClient);

      const result = await service.create({
        code: 'CLI-001',
        name: 'Test Client',
      });

      expect(result).toEqual(mockClient);
    });

    it('rejects a code already used by an active client', async () => {
      prisma.client.findFirst.mockResolvedValue(mockClient);

      await expect(
        service.create({ code: 'CLI-001', name: 'Another Client' }),
      ).rejects.toThrow(ConflictException);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.client.create).not.toHaveBeenCalled();
    });

    it('only checks active clients, so a code freed up by a soft delete can be reused', async () => {
      prisma.client.findFirst.mockResolvedValue(null);
      prisma.client.create.mockResolvedValue(mockClient);

      await service.create({ code: 'CLI-001', name: 'New Client' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.client.findFirst).toHaveBeenCalledWith({
        where: { code: 'CLI-001', deletedAt: null },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.client.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('excludes soft-deleted clients', async () => {
      prisma.client.findMany.mockResolvedValue([mockClient]);
      prisma.client.count.mockResolvedValue(1);

      await service.findAll();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.client.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    });
  });

  describe('findOne', () => {
    it('excludes soft-deleted clients', async () => {
      prisma.client.findUnique.mockResolvedValue(mockClient);

      await service.findOne('client-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.client.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'client-123', deletedAt: null },
        }),
      );
    });

    it('throws NotFoundException if the client does not exist', async () => {
      prisma.client.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('throws NotFoundException if the client does not exist', async () => {
      prisma.client.update.mockRejectedValue(prismaError('P2025'));

      await expect(
        service.update('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects changing the code to one another active client already uses', async () => {
      prisma.client.findFirst.mockResolvedValue({
        ...mockClient,
        id: 'other-client',
      });

      await expect(
        service.update('client-123', { code: 'TAKEN' }),
      ).rejects.toThrow(ConflictException);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.client.update).not.toHaveBeenCalled();
    });

    it('excludes itself from the code conflict check', async () => {
      prisma.client.findFirst.mockResolvedValue(null);
      prisma.client.update.mockResolvedValue(mockClient);

      await service.update('client-123', { code: 'CLI-001' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.client.findFirst).toHaveBeenCalledWith({
        where: { code: 'CLI-001', deletedAt: null, id: { not: 'client-123' } },
      });
    });

    it('does not check for a code conflict when the code is not being changed', async () => {
      prisma.client.update.mockResolvedValue(mockClient);

      await service.update('client-123', { name: 'Renamed Only' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.client.findFirst).not.toHaveBeenCalled();
    });

    it('scopes the update to active clients, so a soft-deleted client 404s instead of being silently edited', async () => {
      prisma.client.update.mockResolvedValue(mockClient);

      await service.update('client-123', { name: 'Renamed Only' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: 'client-123', deletedAt: null },
        data: { name: 'Renamed Only' },
      });
    });
  });

  describe('remove', () => {
    it('soft-deletes by setting deletedAt instead of a real delete', async () => {
      prisma.client.findUnique.mockResolvedValue(mockClient);
      prisma.client.update.mockResolvedValue({
        ...mockClient,
        deletedAt: new Date(),
      });

      await service.remove('client-123', 'user-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.client.delete).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.client.update).toHaveBeenCalledWith({
        where: { id: 'client-123' },
        // jest's expect.any() return type is `any` in the installed
        // @types/jest — a known, long-standing typing gap.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: { deletedAt: expect.any(Date) },
      });
      expect(auditService.logSafe).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', entity: 'Client' }),
      );
    });

    it('throws NotFoundException if the client does not exist', async () => {
      prisma.client.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
