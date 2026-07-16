-- One-time data migration for Railway/PostgreSQL.
--
-- Purpose: when the single-item Loan model (loans.inventoryItemId / quantity)
-- was refactored to multi-item (Loan -> LoanItem[]), the dev/SQLite DB was
-- migrated manually. Production never got that migration, so the next
-- `prisma db push --accept-data-loss` would drop the old columns and lose
-- every existing loan's item association.
--
-- This script:
--   1. Creates the loan_items table if missing.
--   2. Copies each existing loans row's (inventoryItemId, quantity) into a
--      new loan_items row.
--   3. Is fully idempotent — runs as a no-op once the old columns are gone.
--
-- Must execute BEFORE `prisma db push` on every Railway deploy. The DO block
-- gates the whole thing on the old columns still existing.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'loans' AND column_name = 'inventoryItemId'
  ) THEN
    CREATE TABLE IF NOT EXISTS loan_items (
      id                TEXT PRIMARY KEY,
      "loanId"          TEXT NOT NULL,
      "inventoryItemId" TEXT NOT NULL,
      quantity          INTEGER NOT NULL DEFAULT 1,
      notes             TEXT,
      "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT loan_items_loan_fk FOREIGN KEY ("loanId")
        REFERENCES loans (id) ON DELETE CASCADE,
      CONSTRAINT loan_items_item_fk FOREIGN KEY ("inventoryItemId")
        REFERENCES inventory_items (id)
    );

    CREATE INDEX IF NOT EXISTS "loan_items_loanId_idx"
      ON loan_items ("loanId");
    CREATE INDEX IF NOT EXISTS "loan_items_inventoryItemId_idx"
      ON loan_items ("inventoryItemId");

    -- Copy each legacy single-item loan into loan_items. The 'li_' || l.id
    -- prefix gives every generated row a deterministic, unique TEXT id
    -- without depending on pgcrypto / gen_random_uuid being installed.
    INSERT INTO loan_items (id, "loanId", "inventoryItemId", quantity)
    SELECT
      'li_' || l.id,
      l.id,
      l."inventoryItemId",
      COALESCE(l.quantity, 1)
    FROM loans l
    WHERE l."inventoryItemId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM loan_items li WHERE li."loanId" = l.id
      );
  END IF;
END $$;
