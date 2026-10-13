import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { DocumentNumberingService } from './document-numbering.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DocumentNumberingService', () => {
  let service: DocumentNumberingService;
  let tx: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    tx = mockDeep<PrismaService>();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentNumberingService],
    }).compile();
    service = module.get(DocumentNumberingService);
    tx.fiscalConfig.findFirst.mockResolvedValue({ id: 'fc-1' } as never);
  });

  it.each([
    ['LOAN', 'PRE-0007', 'nextLoanNumber'],
    ['TRANSFER', 'TRA-0007', 'nextTransferNumber'],
    ['OUTFLOW', 'SAL-0007', 'nextOutflowNumber'],
    ['QUOTE', 'COT-0007', 'nextQuoteNumber'],
  ] as const)(
    'numbers a %s from its own locked counter, then increments it',
    async (document, expected, counter) => {
      tx.$queryRaw.mockResolvedValueOnce([{ id: 'fc-1', value: 7 }] as never);

      await expect(service.assignNumber(tx, document)).resolves.toBe(expected);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(tx.fiscalConfig.update).toHaveBeenCalledWith({
        where: { id: 'fc-1' },
        data: { [counter]: { increment: 1 } },
      });
    },
  );

  it('keeps every digit past 9999', async () => {
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'fc-1', value: 12345 }] as never);
    await expect(service.assignNumber(tx, 'LOAN')).resolves.toBe('PRE-12345');
  });

  it('creates the FiscalConfig singleton first if it does not exist yet', async () => {
    tx.fiscalConfig.findFirst.mockResolvedValue(null);
    tx.fiscalConfig.create.mockResolvedValue({ id: 'fc-new' } as never);
    tx.$queryRaw.mockResolvedValueOnce([{ id: 'fc-new', value: 1 }] as never);

    await expect(service.assignNumber(tx, 'OUTFLOW')).resolves.toBe('SAL-0001');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(tx.fiscalConfig.create).toHaveBeenCalledWith({ data: {} });
  });
});
