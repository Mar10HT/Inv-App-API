-- Data migration for document numbers. Idempotent; runs before
-- `prisma db push` on every deploy (see railway:migrate in package.json).
--
-- Loans, transfers and outflows used to carry a free-text "reference" (name)
-- typed by the user. They now get an automatic correlative instead (PRE-0001,
-- TRA-0001, SAL-0001), and quotations get COT-0001. This script:
--   1. Adds the new columns if they don't exist yet (db push would add them
--      too, but the backfill below needs them first).
--   2. Numbers every existing row that has no number, in creation order,
--      continuing from the counter in fiscal_config, and moves the counter
--      past them.
--   3. Moves any old reference text into notes ("Referencia: ...") and
--      clears name, so nothing the user typed is lost.
-- Running it again finds nothing left to number or move, so it is a no-op.

ALTER TABLE loans ADD COLUMN IF NOT EXISTS "number" TEXT;
ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS "number" TEXT;
ALTER TABLE outflows ADD COLUMN IF NOT EXISTS "number" TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS "quoteNumber" TEXT;

ALTER TABLE fiscal_config ADD COLUMN IF NOT EXISTS "nextLoanNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fiscal_config ADD COLUMN IF NOT EXISTS "nextTransferNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fiscal_config ADD COLUMN IF NOT EXISTS "nextOutflowNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE fiscal_config ADD COLUMN IF NOT EXISTS "nextQuoteNumber" INTEGER NOT NULL DEFAULT 1;

-- The counters live in the single fiscal_config row; make sure it exists so
-- numbers assigned here are never handed out again by the app.
INSERT INTO fiscal_config (id, "updatedAt")
SELECT 'fiscal-config', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM fiscal_config);

DO $$
DECLARE
  spec RECORD;
  start_at INTEGER;
  assigned INTEGER;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('loans', 'number', 'nextLoanNumber', 'PRE-', ''),
      ('transfer_requests', 'number', 'nextTransferNumber', 'TRA-', ''),
      ('outflows', 'number', 'nextOutflowNumber', 'SAL-', ''),
      ('sales', 'quoteNumber', 'nextQuoteNumber', 'COT-', 'AND status = ''DRAFT''')
    ) AS v(tbl, num_col, counter_col, prefix, extra_where)
  LOOP
    EXECUTE format('SELECT %I FROM fiscal_config ORDER BY "createdAt" LIMIT 1 FOR UPDATE', spec.counter_col)
      INTO start_at;

    EXECUTE format(
      'WITH numbered AS (
         SELECT id, row_number() OVER (ORDER BY "createdAt", id) - 1 + %s AS n
         FROM %I WHERE %I IS NULL %s
       )
       UPDATE %I t
       SET %I = %L || lpad(numbered.n::text, greatest(4, length(numbered.n::text)), ''0'')
       FROM numbered WHERE t.id = numbered.id',
      start_at, spec.tbl, spec.num_col, spec.extra_where, spec.tbl, spec.num_col, spec.prefix);
    GET DIAGNOSTICS assigned = ROW_COUNT;

    IF assigned > 0 THEN
      EXECUTE format('UPDATE fiscal_config SET %I = %I + %s', spec.counter_col, spec.counter_col, assigned);
    END IF;
  END LOOP;
END $$;

-- Old references become the first line of the notes.
UPDATE loans SET
  notes = CASE WHEN coalesce(trim(notes), '') = '' THEN 'Referencia: ' || trim(name)
               ELSE 'Referencia: ' || trim(name) || E'\n' || notes END,
  name = NULL
WHERE coalesce(trim(name), '') <> '';
UPDATE transfer_requests SET
  notes = CASE WHEN coalesce(trim(notes), '') = '' THEN 'Referencia: ' || trim(name)
               ELSE 'Referencia: ' || trim(name) || E'\n' || notes END,
  name = NULL
WHERE coalesce(trim(name), '') <> '';
UPDATE outflows SET
  notes = CASE WHEN coalesce(trim(notes), '') = '' THEN 'Referencia: ' || trim(name)
               ELSE 'Referencia: ' || trim(name) || E'\n' || notes END,
  name = NULL
WHERE coalesce(trim(name), '') <> '';
UPDATE sales SET
  notes = CASE WHEN coalesce(trim(notes), '') = '' THEN 'Referencia: ' || trim(name)
               ELSE 'Referencia: ' || trim(name) || E'\n' || notes END,
  name = NULL
WHERE coalesce(trim(name), '') <> '';

-- Unique indexes under Prisma's own names, so the `prisma db push` that
-- follows finds them in place instead of stopping on a data-loss warning.
CREATE UNIQUE INDEX IF NOT EXISTS "loans_number_key" ON loans ("number");
CREATE UNIQUE INDEX IF NOT EXISTS "transfer_requests_number_key" ON transfer_requests ("number");
CREATE UNIQUE INDEX IF NOT EXISTS "outflows_number_key" ON outflows ("number");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_quoteNumber_key" ON sales ("quoteNumber");
