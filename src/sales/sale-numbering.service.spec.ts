import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { SaleNumberingService } from './sale-numbering.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SaleNumberingService', () => {
  let service: SaleNumberingService;
  let tx: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    tx = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [SaleNumberingService],
    }).compile();

    service = module.get<SaleNumberingService>(SaleNumberingService);
  });

  afterEach(() => jest.clearAllMocks());

  const activeCaiRow = {
    id: 'cai-1',
    currentNumber: 42,
    rangeEnd: 1000,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days out
    establishmentCode: '001',
    emissionPointCode: '001',
    documentTypeCode: '01',
  };

  describe('with an active, valid CAI range', () => {
    it('formats the real Honduran invoice number using the pre-increment value', async () => {
      tx.$queryRaw.mockResolvedValueOnce([activeCaiRow] as never);

      const { number } = await service.assignNumber(tx);

      expect(number).toBe('001-001-01-00000042');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tx.caiRange.update).toHaveBeenCalledWith({
        where: { id: 'cai-1' },
        data: { currentNumber: { increment: 1 } },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tx.fiscalConfig.findFirst).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the range has expired, without consuming a number', async () => {
      tx.$queryRaw.mockResolvedValueOnce([
        { ...activeCaiRow, expiresAt: new Date(Date.now() - 1000) },
      ] as never);

      await expect(service.assignNumber(tx)).rejects.toThrow(
        BadRequestException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tx.caiRange.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the range is exhausted, without consuming a number', async () => {
      tx.$queryRaw.mockResolvedValueOnce([
        { ...activeCaiRow, currentNumber: 1001, rangeEnd: 1000 },
      ] as never);

      await expect(service.assignNumber(tx)).rejects.toThrow(
        BadRequestException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tx.caiRange.update).not.toHaveBeenCalled();
    });
  });

  describe('with no active CAI range', () => {
    it('falls back to the FiscalConfig correlative, formatted V-####', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([] as never) // no active CAI range
        .mockResolvedValueOnce([
          { id: 'fc-1', fallbackSaleNumber: 7 },
        ] as never); // locked FiscalConfig row
      tx.fiscalConfig.findFirst.mockResolvedValue({
        id: 'fc-1',
        fallbackSaleNumber: 7,
      } as never);

      const { number } = await service.assignNumber(tx);

      expect(number).toBe('V-0007');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tx.fiscalConfig.update).toHaveBeenCalledWith({
        where: { id: 'fc-1' },
        data: { fallbackSaleNumber: { increment: 1 } },
      });
    });

    it('creates the FiscalConfig singleton first if it does not exist yet', async () => {
      tx.$queryRaw
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([
          { id: 'fc-new', fallbackSaleNumber: 1 },
        ] as never);
      tx.fiscalConfig.findFirst.mockResolvedValue(null);
      tx.fiscalConfig.create.mockResolvedValue({
        id: 'fc-new',
        fallbackSaleNumber: 1,
      } as never);

      const { number } = await service.assignNumber(tx);

      expect(number).toBe('V-0001');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tx.fiscalConfig.create).toHaveBeenCalledWith({ data: {} });
    });
  });
});
