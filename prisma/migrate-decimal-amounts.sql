-- Data migration for the Float -> Decimal(14,2)/(5,2) switch on money and
-- percentage columns. Idempotent; runs before `prisma db push` on every
-- deploy (see railway:migrate in package.json), right after
-- migrate-document-numbers.sql and before db push.
--
-- `db push` alone can ALTER a column's type on its own, but only by issuing
-- a bare `ALTER TABLE ... ALTER COLUMN ... TYPE numeric(p,s)` with no USING
-- clause; Postgres accepts that for a double precision -> numeric change
-- (it has an implicit cast), so this script is not strictly required for
-- `db push` to succeed. It exists so the ordering and precision of this
-- migration are explicit and tested (see test/decimal-migration.int-spec.ts),
-- and so a column already converted is never touched again.
--
-- On a database that already has the tables, this script converts every
-- affected column still typed double precision to numeric(p,s) using an
-- explicit ::numeric cast (rounding to the target scale exactly once, the
-- same rounding `numeric(14,2)` would apply on its own).
-- On a new, empty database it does nothing: `db push` creates everything
-- already as numeric.
-- Running it again finds nothing left to convert (idempotent: every column
-- is checked against information_schema.columns first).

DO $$
DECLARE
  spec RECORD;
BEGIN
  IF to_regclass('public.inventory_items') IS NULL THEN
    RETURN;
  END IF;

  FOR spec IN
    SELECT * FROM (VALUES
      ('inventory_items', 'price', 14, 2),
      ('outflow_items', 'unitPrice', 14, 2),
      ('sales', 'totalAmount', 14, 2),
      ('sales', 'taxAmount', 14, 2),
      ('sales', 'taxPercent', 5, 2),
      ('sale_items', 'unitPrice', 14, 2),
      ('sale_items', 'lineTotal', 14, 2),
      ('sale_items', 'taxAmount', 14, 2),
      ('sale_items', 'taxPercent', 5, 2),
      ('fiscal_config', 'isvPercent', 5, 2),
      ('purchase_invoices', 'totalAmount', 14, 2),
      ('purchase_invoices', 'taxAmount', 14, 2),
      ('purchase_invoices', 'taxPercent', 5, 2),
      ('purchase_invoice_items', 'unitPrice', 14, 2),
      ('purchase_invoice_items', 'lineTotal', 14, 2),
      ('purchase_invoice_items', 'taxAmount', 14, 2),
      ('purchase_invoice_items', 'taxPercent', 5, 2),
      ('payments', 'amount', 14, 2),
      ('clients', 'creditLimit', 14, 2)
    ) AS v(tbl, col, precision, scale)
  LOOP
    -- Table may not exist yet on an older database predating that model
    -- (e.g. clients/payments on a pre-Phase-5 snapshot); skip it, db push
    -- creates it from scratch with the right type.
    IF to_regclass(format('public.%I', spec.tbl)) IS NULL THEN
      CONTINUE;
    END IF;

    -- Idempotency guard: only convert a column still typed double precision.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = spec.tbl
        AND column_name = spec.col AND data_type = 'double precision'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN %I TYPE numeric(%s,%s) USING %I::numeric(%s,%s)',
        spec.tbl, spec.col, spec.precision, spec.scale,
        spec.col, spec.precision, spec.scale
      );
    END IF;
  END LOOP;
END $$;
