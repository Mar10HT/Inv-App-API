/*
  Warnings:

  - Made the column `organizationId` on table `audit_logs` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `categories` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `discharge_request_items` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `discharge_requests` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `inventory_items` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `loans` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `scheduled_reports` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `stock_alerts` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `stock_take_items` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `stock_takes` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `suppliers` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `transaction_items` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `transactions` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `transfer_request_items` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `transfer_requests` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `user_warehouses` required. This step will fail if there are existing NULL values in that column.
  - Made the column `organizationId` on table `warehouses` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "categories" DROP CONSTRAINT "categories_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "discharge_request_items" DROP CONSTRAINT "discharge_request_items_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "discharge_requests" DROP CONSTRAINT "discharge_requests_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "loans" DROP CONSTRAINT "loans_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "scheduled_reports" DROP CONSTRAINT "scheduled_reports_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "stock_alerts" DROP CONSTRAINT "stock_alerts_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "stock_take_items" DROP CONSTRAINT "stock_take_items_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "stock_takes" DROP CONSTRAINT "stock_takes_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "suppliers" DROP CONSTRAINT "suppliers_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "transaction_items" DROP CONSTRAINT "transaction_items_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "transfer_request_items" DROP CONSTRAINT "transfer_request_items_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "transfer_requests" DROP CONSTRAINT "transfer_requests_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "user_warehouses" DROP CONSTRAINT "user_warehouses_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "warehouses" DROP CONSTRAINT "warehouses_organizationId_fkey";

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "categories" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "discharge_request_items" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "discharge_requests" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "inventory_items" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "loans" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "scheduled_reports" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "stock_alerts" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "stock_take_items" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "stock_takes" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "suppliers" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "transaction_items" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "transfer_request_items" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "transfer_requests" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_warehouses" ALTER COLUMN "organizationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "warehouses" ALTER COLUMN "organizationId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_warehouses" ADD CONSTRAINT "user_warehouses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_requests" ADD CONSTRAINT "transfer_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_request_items" ADD CONSTRAINT "transfer_request_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_takes" ADD CONSTRAINT "stock_takes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_take_items" ADD CONSTRAINT "stock_take_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_requests" ADD CONSTRAINT "discharge_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discharge_request_items" ADD CONSTRAINT "discharge_request_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- TRIGGERS: enforce parent-child organizationId consistency
-- ----------------------------------------------------------------------------
-- The 4 child tables (transaction_items, transfer_request_items,
-- stock_take_items, discharge_request_items) carry a denormalized
-- organizationId for query performance. These triggers guarantee that the
-- child's organizationId always matches its parent's on INSERT / UPDATE.
--
-- Failing fast at the DB level is intentional: it catches application bugs
-- that would otherwise leak data across tenants. Phase 2's Prisma extension
-- will set these automatically, so application code never has to manage them.
-- ============================================================================

-- transaction_items <-> transactions
CREATE OR REPLACE FUNCTION ensure_transaction_item_org_matches()
RETURNS TRIGGER AS $$
DECLARE
  parent_org TEXT;
BEGIN
  SELECT "organizationId" INTO parent_org
  FROM "transactions"
  WHERE "id" = NEW."transactionId";

  IF parent_org IS NULL THEN
    RAISE EXCEPTION 'Parent transaction % not found or has no organizationId', NEW."transactionId";
  END IF;

  IF NEW."organizationId" IS DISTINCT FROM parent_org THEN
    RAISE EXCEPTION 'transaction_items.organizationId (%) must match parent transactions.organizationId (%)',
      NEW."organizationId", parent_org;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transaction_items_org_consistency
BEFORE INSERT OR UPDATE OF "organizationId", "transactionId" ON "transaction_items"
FOR EACH ROW
EXECUTE FUNCTION ensure_transaction_item_org_matches();

-- transfer_request_items <-> transfer_requests
CREATE OR REPLACE FUNCTION ensure_transfer_request_item_org_matches()
RETURNS TRIGGER AS $$
DECLARE
  parent_org TEXT;
BEGIN
  SELECT "organizationId" INTO parent_org
  FROM "transfer_requests"
  WHERE "id" = NEW."transferRequestId";

  IF parent_org IS NULL THEN
    RAISE EXCEPTION 'Parent transfer_request % not found or has no organizationId', NEW."transferRequestId";
  END IF;

  IF NEW."organizationId" IS DISTINCT FROM parent_org THEN
    RAISE EXCEPTION 'transfer_request_items.organizationId (%) must match parent transfer_requests.organizationId (%)',
      NEW."organizationId", parent_org;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transfer_request_items_org_consistency
BEFORE INSERT OR UPDATE OF "organizationId", "transferRequestId" ON "transfer_request_items"
FOR EACH ROW
EXECUTE FUNCTION ensure_transfer_request_item_org_matches();

-- stock_take_items <-> stock_takes
CREATE OR REPLACE FUNCTION ensure_stock_take_item_org_matches()
RETURNS TRIGGER AS $$
DECLARE
  parent_org TEXT;
BEGIN
  SELECT "organizationId" INTO parent_org
  FROM "stock_takes"
  WHERE "id" = NEW."stockTakeId";

  IF parent_org IS NULL THEN
    RAISE EXCEPTION 'Parent stock_take % not found or has no organizationId', NEW."stockTakeId";
  END IF;

  IF NEW."organizationId" IS DISTINCT FROM parent_org THEN
    RAISE EXCEPTION 'stock_take_items.organizationId (%) must match parent stock_takes.organizationId (%)',
      NEW."organizationId", parent_org;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_take_items_org_consistency
BEFORE INSERT OR UPDATE OF "organizationId", "stockTakeId" ON "stock_take_items"
FOR EACH ROW
EXECUTE FUNCTION ensure_stock_take_item_org_matches();

-- discharge_request_items <-> discharge_requests
CREATE OR REPLACE FUNCTION ensure_discharge_request_item_org_matches()
RETURNS TRIGGER AS $$
DECLARE
  parent_org TEXT;
BEGIN
  SELECT "organizationId" INTO parent_org
  FROM "discharge_requests"
  WHERE "id" = NEW."dischargeRequestId";

  IF parent_org IS NULL THEN
    RAISE EXCEPTION 'Parent discharge_request % not found or has no organizationId', NEW."dischargeRequestId";
  END IF;

  IF NEW."organizationId" IS DISTINCT FROM parent_org THEN
    RAISE EXCEPTION 'discharge_request_items.organizationId (%) must match parent discharge_requests.organizationId (%)',
      NEW."organizationId", parent_org;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER discharge_request_items_org_consistency
BEFORE INSERT OR UPDATE OF "organizationId", "dischargeRequestId" ON "discharge_request_items"
FOR EACH ROW
EXECUTE FUNCTION ensure_discharge_request_item_org_matches();
