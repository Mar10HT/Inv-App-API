/**
 * Integration test for prisma/migrate-decimal-amounts.sql against a real
 * PostgreSQL database: idempotency and the exact ALTER COLUMN ... USING
 * cast it relies on only exist in the database, a mocked Prisma can't show
 * them. Same pattern as stock-concurrency.int-spec.ts (real PrismaClient
 * against DATABASE_URL, run with `npm run test:integration`), but this one
 * points at a dedicated `obsid_decimal_test` database instead of whatever
 * DATABASE_URL names — the script runs destructive ALTER COLUMN statements
 * by table name, so it must never run against a real dev/prod database by
 * accident. Create it once with:
 *   psql -U postgres -h localhost -c "CREATE DATABASE obsid_decimal_test;"
 *
 * The 8 tables created here are deliberately minimal (id + the exact
 * money/percent columns migrate-decimal-amounts.sql touches, nothing else,
 * no FKs) — the script only cares about table/column name and type, not
 * about the rest of the real schema.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const MIGRATION_SQL = readFileSync(
  join(__dirname, '..', 'prisma', 'migrate-decimal-amounts.sql'),
  'utf-8',
);

function testDbUrl(): string {
  const base = new URL(process.env.DATABASE_URL ?? '');
  base.pathname = '/obsid_decimal_test';
  return base.toString();
}

const prisma = new PrismaClient({
  datasources: { db: { url: testDbUrl() } },
});

// Table -> [column, double-precision seed values] for every one of the 19
// fields migrate-decimal-amounts.sql converts. Values are all exact to 2
// decimals, same real-world assumption the migration relies on (no row in
// the actual app database has ever carried more than 2 decimals).
const TABLE_SEEDS: Record<string, Record<string, number[]>> = {
  inventory_items: { price: [19.99, 0, 1000] },
  outflow_items: { unitPrice: [5.5, 0] },
  sales: {
    totalAmount: [33.33, 0],
    taxAmount: [5.0, 0],
    taxPercent: [15, 0],
  },
  sale_items: {
    unitPrice: [10.25, 0],
    lineTotal: [20.5, 0],
    taxAmount: [3.08, 0],
    taxPercent: [15, 0],
  },
  fiscal_config: { isvPercent: [15, 18] },
  purchase_invoices: {
    totalAmount: [100, 0],
    taxAmount: [15, 0],
    taxPercent: [15, 0],
  },
  purchase_invoice_items: {
    unitPrice: [50.5, 0],
    lineTotal: [101, 0],
    taxAmount: [15.15, 0],
    taxPercent: [15, 0],
  },
  payments: { amount: [28.33, 10] },
  clients: { creditLimit: [1000, 0] },
};

async function dropAllTestTables(): Promise<void> {
  for (const table of Object.keys(TABLE_SEEDS)) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${table}`);
  }
}

/** Creates every table as double precision and seeds it with known rows. */
async function createDoublePrecisionTables(): Promise<void> {
  for (const [table, columns] of Object.entries(TABLE_SEEDS)) {
    const colDefs = Object.keys(columns)
      .map((col) => `"${col}" DOUBLE PRECISION`)
      .join(', ');
    await prisma.$executeRawUnsafe(
      `CREATE TABLE ${table} (id SERIAL PRIMARY KEY, ${colDefs})`,
    );
    const rowCount = Math.max(...Object.values(columns).map((v) => v.length));
    for (let i = 0; i < rowCount; i++) {
      const cols = Object.keys(columns);
      const values = cols.map((col) => columns[col][i] ?? columns[col][0]);
      const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ');
      await prisma.$executeRawUnsafe(
        `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`,
        ...values,
      );
    }
  }
}

async function runMigration(): Promise<void> {
  await prisma.$executeRawUnsafe(MIGRATION_SQL);
}

interface Snapshot {
  count: number;
  sums: Record<string, number>;
}

async function snapshot(): Promise<Record<string, Snapshot>> {
  const result: Record<string, Snapshot> = {};
  for (const [table, columns] of Object.entries(TABLE_SEEDS)) {
    const [{ count }] = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT COUNT(*) AS count FROM ${table}`,
    );
    const sums: Record<string, number> = {};
    for (const col of Object.keys(columns)) {
      const [row] = await prisma.$queryRawUnsafe<[{ total: unknown }]>(
        `SELECT COALESCE(SUM("${col}"), 0) AS total FROM ${table}`,
      );
      sums[col] = Number(row.total);
    }
    result[table] = { count: Number(count), sums };
  }
  return result;
}

async function columnTypes(table: string): Promise<Record<string, string>> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ column_name: string; data_type: string }>
  >(
    `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
    table,
  );
  return Object.fromEntries(rows.map((r) => [r.column_name, r.data_type]));
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('migrate-decimal-amounts.sql', () => {
  it('does nothing on a database with none of the tables yet', async () => {
    await dropAllTestTables();

    await expect(runMigration()).resolves.not.toThrow();
  });

  it('converts every double-precision column to numeric without changing counts or sums', async () => {
    await dropAllTestTables();
    await createDoublePrecisionTables();
    const before = await snapshot();

    // Postgres caches a prepared plan per query text per connection; reusing
    // the same SUM(col) query text against a column whose type just changed
    // (ALTER COLUMN ... TYPE numeric) errors with "cached plan must not
    // change result type" on that same session. Force a fresh connection
    // for the post-migration snapshot.
    await prisma.$disconnect();
    await runMigration();
    await prisma.$disconnect();

    const after = await snapshot();
    expect(after).toEqual(before);

    for (const [table, columns] of Object.entries(TABLE_SEEDS)) {
      const types = await columnTypes(table);
      for (const col of Object.keys(columns)) {
        expect(types[col]).toBe('numeric');
      }
    }
  });

  it('is idempotent: running it again on already-migrated columns changes nothing and does not error', async () => {
    // Tables are already numeric from the previous test's run.
    const before = await snapshot();
    await prisma.$disconnect();

    await expect(runMigration()).resolves.not.toThrow();
    await prisma.$disconnect();

    const after = await snapshot();
    expect(after).toEqual(before);
  });
});
