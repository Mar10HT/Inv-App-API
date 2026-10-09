import { Test, TestingModule } from '@nestjs/testing';
import type { FiscalConfig } from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { FiscalConfigService } from './fiscal-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('FiscalConfigService', () => {
  let service: FiscalConfigService;
  let prisma: DeepMockProxy<PrismaService>;
  let auditService: { logSafe: jest.Mock };

  const mockConfig = {
    id: 'fiscal-config-1',
    rtn: null,
    fiscalEmail: null,
    fiscalPhone: null,
    address: null,
    currency: 'HNL',
    isvPercent: 15,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as FiscalConfig;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    auditService = { logSafe: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FiscalConfigService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<FiscalConfigService>(FiscalConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('returns the existing row without creating a new one', async () => {
      prisma.fiscalConfig.findFirst.mockResolvedValue(mockConfig);

      const result = await service.get();

      expect(result).toEqual(mockConfig);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.fiscalConfig.create).not.toHaveBeenCalled();
    });

    it('creates the singleton row with schema defaults when none exists', async () => {
      prisma.fiscalConfig.findFirst.mockResolvedValue(null);
      prisma.fiscalConfig.create.mockResolvedValue(mockConfig);

      const result = await service.get();

      expect(result).toEqual(mockConfig);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.fiscalConfig.create).toHaveBeenCalledWith({ data: {} });
    });
  });

  describe('update', () => {
    it('updates the singleton row and logs the change', async () => {
      prisma.fiscalConfig.findFirst.mockResolvedValue(mockConfig);
      const updated = { ...mockConfig, rtn: '08011999123456' };
      prisma.fiscalConfig.update.mockResolvedValue(updated);

      const result = await service.update({ rtn: '08011999123456' }, 'user-1');

      expect(result.rtn).toBe('08011999123456');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.fiscalConfig.update).toHaveBeenCalledWith({
        where: { id: mockConfig.id },
        data: { rtn: '08011999123456' },
      });
      expect(auditService.logSafe).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE', entity: 'FiscalConfig' }),
      );
    });

    it('auto-creates the row first if none exists yet, then updates it', async () => {
      prisma.fiscalConfig.findFirst.mockResolvedValue(null);
      prisma.fiscalConfig.create.mockResolvedValue(mockConfig);
      prisma.fiscalConfig.update.mockResolvedValue({
        ...mockConfig,
        isvPercent: 18,
      });

      await service.update({ isvPercent: 18 });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.fiscalConfig.create).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.fiscalConfig.update).toHaveBeenCalledWith({
        where: { id: mockConfig.id },
        data: { isvPercent: 18 },
      });
    });
  });
});
