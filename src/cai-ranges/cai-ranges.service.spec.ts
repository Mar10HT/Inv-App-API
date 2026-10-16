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

    it('reads a date-only expiresAt as the end of that day in Honduras', async () => {
      prisma.caiRange.create.mockResolvedValue(mockRange);

      await service.create({
        cai: mockRange.cai,
        establishmentCode: '001',
        emissionPointCode: '001',
        rangeStart: 1,
        rangeEnd: 1000,
        expiresAt: '2027-06-30',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.caiRange.create).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          expiresAt: '2027-07-01T05:59:59.999Z',
        }),
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
      prisma.caiRange.findUnique.mockResolvedValue(mockRange);
      await expect(
        service.update(mockRange.id, { rangeStart: 500, rangeEnd: 100 }),
      ).rejects.toThrow(BadRequestException);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.caiRange.update).not.toHaveBeenCalled();
    });

    it('checks a lone rangeEnd against the stored rangeStart', async () => {
      prisma.caiRange.findUnique.mockResolvedValue({
        ...mockRange,
        rangeStart: 500,
        currentNumber: 500,
      });

      await expect(
        service.update(mockRange.id, { rangeEnd: 100 }),
      ).rejects.toMatchObject({ response: { code: 'CAI_RANGE_INVALID' } });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.caiRange.update).not.toHaveBeenCalled();
    });

    it('rejects a rangeEnd below the last number already issued', async () => {
      prisma.caiRange.findUnique.mockResolvedValue({
        ...mockRange,
        currentNumber: 51,
      });

      await expect(
        service.update(mockRange.id, { rangeEnd: 49 }),
      ).rejects.toMatchObject({
        response: {
          code: 'CAI_RANGE_BELOW_ISSUED',
          params: { lastIssued: 50 },
        },
      });
    });

    it('lets rangeEnd stop exactly at the last number issued', async () => {
      prisma.caiRange.findUnique.mockResolvedValue({
        ...mockRange,
        currentNumber: 51,
      });
      prisma.caiRange.update.mockResolvedValue(mockRange);

      await service.update(mockRange.id, { rangeEnd: 50 });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.caiRange.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { rangeEnd: 50 } }),
      );
    });

    it('rejects moving rangeStart once numbers were issued', async () => {
      prisma.caiRange.findUnique.mockResolvedValue({
        ...mockRange,
        currentNumber: 2,
      });

      await expect(
        service.update(mockRange.id, { rangeStart: 10 }),
      ).rejects.toMatchObject({ response: { code: 'CAI_RANGE_IN_USE' } });
    });

    it('moves the next number along with rangeStart while nothing was issued', async () => {
      prisma.caiRange.findUnique.mockResolvedValue(mockRange);
      prisma.caiRange.update.mockResolvedValue(mockRange);

      await service.update(mockRange.id, { rangeStart: 10 });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.caiRange.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { rangeStart: 10, currentNumber: 10 },
        }),
      );
    });

    it('reads a date-only expiresAt as the end of that day in Honduras', async () => {
      prisma.caiRange.findUnique.mockResolvedValue(mockRange);
      prisma.caiRange.update.mockResolvedValue(mockRange);

      await service.update(mockRange.id, { expiresAt: '2027-06-30' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.caiRange.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { expiresAt: '2027-07-01T05:59:59.999Z' },
        }),
      );
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
