import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, type CaiRange } from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { CaiRangesService } from './cai-ranges.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('test error', {
    code,
    clientVersion: '6.x',
  });

describe('CaiRangesService', () => {
  let service: CaiRangesService;
  let prisma: DeepMockProxy<PrismaService>;

  const mockRange = {
    id: 'cai-123',
    cai: '12345678901234567890123456789012345678901',
    establishmentCode: '001',
    emissionPointCode: '001',
    documentTypeCode: '01',
    rangeStart: 1,
    rangeEnd: 1000,
    currentNumber: 1,
    expiresAt: new Date('2027-01-01'),
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as CaiRange;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaiRangesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
            logSafe: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CaiRangesService>(CaiRangesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('initializes currentNumber to rangeStart', async () => {
      prisma.caiRange.create.mockResolvedValue(mockRange);

      await service.create({
        cai: mockRange.cai,
        establishmentCode: '001',
        emissionPointCode: '001',
        rangeStart: 1,
        rangeEnd: 1000,
        expiresAt: '2027-01-01',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.caiRange.create).toHaveBeenCalledWith({
        // jest's expect.objectContaining() return type is `any` in the
        // installed @types/jest — a known, long-standing typing gap.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ currentNumber: 1 }),
      });
    });

    it('rejects rangeEnd <= rangeStart without touching the database', async () => {
      await expect(
        service.create({
          cai: mockRange.cai,
          establishmentCode: '001',
          emissionPointCode: '001',
          rangeStart: 100,
          rangeEnd: 100,
          expiresAt: '2027-01-01',
        }),
      ).rejects.toThrow(BadRequestException);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.caiRange.create).not.toHaveBeenCalled();
    });

    it('deactivates every other range when creating an active one', async () => {
      prisma.caiRange.create.mockResolvedValue({
        ...mockRange,
        isActive: true,
      });

      await service.create({
        cai: mockRange.cai,
        establishmentCode: '001',
        emissionPointCode: '001',
        rangeStart: 1,
        rangeEnd: 1000,
        expiresAt: '2027-01-01',
        isActive: true,
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.caiRange.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      });
    });

    it('does not touch other ranges when creating an inactive one', async () => {
      prisma.caiRange.create.mockResolvedValue(mockRange);

      await service.create({
        cai: mockRange.cai,
        establishmentCode: '001',
        emissionPointCode: '001',
        rangeStart: 1,
        rangeEnd: 1000,
        expiresAt: '2027-01-01',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.caiRange.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('deactivates every other range, excluding itself, when activating one', async () => {
      prisma.caiRange.findUnique.mockResolvedValue(mockRange);
      prisma.caiRange.update.mockResolvedValue({
        ...mockRange,
        isActive: true,
      });

      await service.update(mockRange.id, { isActive: true });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.caiRange.updateMany).toHaveBeenCalledWith({
        where: { isActive: true, id: { not: mockRange.id } },
        data: { isActive: false },
      });
    });

    it('rejects rangeEnd <= rangeStart when both are provided together', async () => {
      await expect(
        service.update(mockRange.id, { rangeStart: 500, rangeEnd: 100 }),
      ).rejects.toThrow(BadRequestException);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.caiRange.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if the range does not exist', async () => {
      prisma.caiRange.findUnique.mockResolvedValue(mockRange);
      prisma.caiRange.update.mockRejectedValue(prismaError('P2025'));

      await expect(
        service.update('nonexistent', { cai: 'new-cai' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
