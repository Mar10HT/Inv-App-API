/**
 * Integration test against a real PostgreSQL database: the row locks under
 * test only exist in the database, a mocked Prisma can't show them.
 *
 * Needs DATABASE_URL pointing at a disposable database with the schema
 * pushed (`prisma db push`). Run with `npm run test:integration`.
 */
import { LoanStatus, PrismaClient } from '@prisma/client';
import { LoansService } from '../src/loans/loans.service';
import { QrService } from '../src/qr/qr.service';
import { DocumentNumberingService } from '../src/common/numbering/document-numbering.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { AuditService } from '../src/audit/audit.service';
import type { EventsService } from '../src/events/events.service';

const prisma = new PrismaClient();

const loans = new LoansService(
  prisma as unknown as PrismaService,
  new QrService(),
  { emitLoanChange: () => undefined } as unknown as EventsService,
  {
    log: () => Promise.resolve(),
    logSafe: () => undefined,
  } as unknown as AuditService,
  new DocumentNumberingService(),
);

const run = `int-loan-${Date.now()}`;
let userId: string;
let sourceId: string;
let destinationId: string;

const newLoan = (status: LoanStatus = LoanStatus.PENDING) =>
  prisma.loan.create({
    data: {
      sourceWarehouseId: sourceId,
      destinationWarehouseId: destinationId,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdById: userId,
      status,
    },
  });

const reload = (id: string) => prisma.loan.findUniqueOrThrow({ where: { id } });

const codeOf = (result: PromiseSettledResult<unknown>) =>
  result.status === 'rejected'
    ? (result.reason as { response?: { code?: string } }).response?.code
    : undefined;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `${run}@test.local`, password: 'x', name: run },
  });
  const [source, destination] = await Promise.all(
    ['a', 'b'].map((side) =>
      prisma.warehouse.create({
        data: { name: `${run}-${side}`, location: 'test' },
      }),
    ),
  );
  userId = user.id;
  sourceId = source.id;
  destinationId = destination.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('loans under concurrent requests', () => {
  it('sends a loan once, and the code handed out is the one that works', async () => {
    const loan = await newLoan();

    const results = await Promise.allSettled(
      [1, 2, 3].map(() => loans.sendLoan(loan.id, userId)),
    );

    const sent = results.filter((r) => r.status === 'fulfilled');
    expect(sent).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').map(codeOf)).toEqual([
      'LOAN_NOT_PENDING',
      'LOAN_NOT_PENDING',
    ]);
    const handedOut = (
      sent[0] as PromiseFulfilledResult<{ sendQrCode: string }>
    ).value.sendQrCode;
    expect((await reload(loan.id)).sendQrCode).toBe(handedOut);
  });

  it('confirms receipt once when the code is scanned three times at once', async () => {
    const loan = await newLoan();
    const sent = await loans.sendLoan(loan.id, userId);

    const results = await Promise.allSettled(
      [1, 2, 3].map(() =>
        loans.confirmReceipt(sent.sendQrCode as string, userId),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').map(codeOf)).toEqual([
      'LOAN_RECEIPT_INVALID_STATUS',
      'LOAN_RECEIPT_INVALID_STATUS',
    ]);
  });

  it('starts a return once, and the code handed out is the one that works', async () => {
    const loan = await newLoan(LoanStatus.RECEIVED);

    const results = await Promise.allSettled(
      [1, 2, 3].map(() => loans.initiateReturn(loan.id, userId)),
    );

    const started = results.filter((r) => r.status === 'fulfilled');
    expect(started).toHaveLength(1);
    const handedOut = (
      started[0] as PromiseFulfilledResult<{ returnQrCode: string }>
    ).value.returnQrCode;
    expect((await reload(loan.id)).returnQrCode).toBe(handedOut);
  });

  it('ends a returning loan either returned or cancelled, never both at once', async () => {
    for (let i = 0; i < 5; i++) {
      const loan = await newLoan(LoanStatus.RECEIVED);
      const returning = await loans.initiateReturn(loan.id, userId);

      const [returned, cancelled] = await Promise.allSettled([
        loans.confirmReturn(returning.returnQrCode as string, userId),
        loans.cancel(loan.id, userId),
      ]);

      const { status } = await reload(loan.id);
      if (status === LoanStatus.RETURNED) {
        // The return won; the cancel waited and found it already returned
        expect(codeOf(cancelled)).toBe('LOAN_NOT_CANCELLABLE');
      } else {
        // The cancel won; the return waited and found it cancelled
        expect(status).toBe(LoanStatus.CANCELLED);
        expect(codeOf(returned)).toBe('LOAN_RETURN_CONFIRM_INVALID_STATUS');
      }
    }
  });
});
