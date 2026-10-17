import { Prisma } from '@prisma/client';

/** Tables whose status transitions move stock or money. */
type LockableTable =
  | 'sales'
  | 'purchase_invoices'
  | 'outflows'
  | 'transfer_requests'
  | 'discharge_requests'
  | 'transactions';

/**
 * Locks a document row until the caller's transaction ends. Call it before
 * reading the status a transition depends on: a concurrent confirm/cancel of
 * the same document then waits here and reads the status the first one left,
 * instead of both passing the check and moving stock twice.
 */
export async function lockForUpdate(
  tx: Prisma.TransactionClient,
  table: LockableTable,
  id: string,
): Promise<void> {
  // The table name comes from the fixed union above, never from input.
  await tx.$executeRaw(
    Prisma.sql`SELECT 1 FROM ${Prisma.raw(`"${table}"`)} WHERE "id" = ${id} FOR UPDATE`,
  );
}
