-- Manual migration: split Loan into Loan + LoanItem (multi-item support)
PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- 1. Create the new loan_items table
CREATE TABLE "loan_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loanId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loan_items_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "loans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "loan_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "loan_items_loanId_idx" ON "loan_items"("loanId");
CREATE INDEX "loan_items_inventoryItemId_idx" ON "loan_items"("inventoryItemId");

-- 2. Migrate existing single-item loans into loan_items
INSERT INTO "loan_items" ("id", "loanId", "inventoryItemId", "quantity", "notes", "createdAt")
SELECT
    lower(hex(randomblob(16))),
    l."id",
    l."inventoryItemId",
    l."quantity",
    NULL,
    l."createdAt"
FROM "loans" l;

-- 3. Rebuild loans table without inventoryItemId/quantity columns
CREATE TABLE "loans_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceWarehouseId" TEXT NOT NULL,
    "destinationWarehouseId" TEXT NOT NULL,
    "loanDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" DATETIME NOT NULL,
    "returnDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sendQrCode" TEXT,
    "returnQrCode" TEXT,
    "receivedAt" DATETIME,
    "receivedById" TEXT,
    "returnConfirmedAt" DATETIME,
    "returnConfirmedById" TEXT,
    CONSTRAINT "loans_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "loans_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "loans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "loans_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "loans_returnConfirmedById_fkey" FOREIGN KEY ("returnConfirmedById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "loans_new" (
    "id","sourceWarehouseId","destinationWarehouseId","loanDate","dueDate","returnDate",
    "status","notes","createdById","createdAt","updatedAt","sendQrCode","returnQrCode",
    "receivedAt","receivedById","returnConfirmedAt","returnConfirmedById"
)
SELECT
    "id","sourceWarehouseId","destinationWarehouseId","loanDate","dueDate","returnDate",
    "status","notes","createdById","createdAt","updatedAt","sendQrCode","returnQrCode",
    "receivedAt","receivedById","returnConfirmedAt","returnConfirmedById"
FROM "loans";

DROP TABLE "loans";
ALTER TABLE "loans_new" RENAME TO "loans";

CREATE UNIQUE INDEX "loans_sendQrCode_key" ON "loans"("sendQrCode");
CREATE UNIQUE INDEX "loans_returnQrCode_key" ON "loans"("returnQrCode");
CREATE INDEX "loans_sourceWarehouseId_idx" ON "loans"("sourceWarehouseId");
CREATE INDEX "loans_destinationWarehouseId_idx" ON "loans"("destinationWarehouseId");
CREATE INDEX "loans_status_idx" ON "loans"("status");
CREATE INDEX "loans_dueDate_idx" ON "loans"("dueDate");
CREATE INDEX "loans_createdById_idx" ON "loans"("createdById");
CREATE INDEX "loans_sendQrCode_idx" ON "loans"("sendQrCode");
CREATE INDEX "loans_returnQrCode_idx" ON "loans"("returnQrCode");

COMMIT;

PRAGMA foreign_keys = ON;
