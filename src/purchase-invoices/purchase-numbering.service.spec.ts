import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { PurchaseNumberingService } from './purchase-numbering.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PurchaseNumberingService', () => {
  let service: PurchaseNumberingService;
  let tx: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    tx = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PurchaseNumberingService],
    }).compile();

    service = module.get<PurchaseNumberingService>(PurchaseNumberingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('formats the correlative from the locked FiscalConfig row, using the pre-increment value', async () => {
    tx.fiscalConfig.findFirst.mockResolvedValue({
      id: 'fc-1',
      nextPurchaseNumber: 7,
    } as never);
    tx.$queryRaw.mockResolvedValueOnce([
      { id: 'fc-1', nextPurchaseNumber: 7 },
    ] as never);

    const { number } = await service.assignNumber(tx);

    expect(number).toBe('COM-0007');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(tx.fiscalConfig.update).toHaveBeenCalledWith({
      where: { id: 'fc-1' },
      data: { nextPurchaseNumber: { increment: 1 } },
    });
  });

  it('creates the FiscalConfig singleton first if it does not exist yet', async () => {
    tx.fiscalConfig.findFirst.mockResolvedValue(null);
    tx.fiscalConfig.create.mockResolvedValue({
      id: 'fc-new',
      nextPurchaseNumber: 1,
    } as never);
    tx.$queryRaw.mockResolvedValueOnce([
      { id: 'fc-new', nextPurchaseNumber: 1 },
    ] as never);

    const { number } = await service.assignNumber(tx);

    expect(number).toBe('COM-0001');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(tx.fiscalConfig.create).toHaveBeenCalledWith({ data: {} });
  });
});
