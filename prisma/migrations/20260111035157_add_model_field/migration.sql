-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 10,
    "category" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "price" REAL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sku" TEXT,
    "barcode" TEXT,
    "imageUrl" TEXT,
    "itemType" TEXT NOT NULL DEFAULT 'BULK',
    "serviceTag" TEXT,
    "serialNumber" TEXT,
    "warehouseId" TEXT NOT NULL,
    "supplierId" TEXT,
    "assignedToUserId" TEXT,
    "assignedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdById" TEXT,
    CONSTRAINT "inventory_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inventory_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_items_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "inventory_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "changes" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "itemId" TEXT,
    CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "audit_logs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "sourceWarehouseId" TEXT,
    "destinationWarehouseId" TEXT,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "transactions_sourceWarehouseId_fkey" FOREIGN KEY ("sourceWarehouseId") REFERENCES "warehouses" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES "warehouses" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transaction_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    CONSTRAINT "transaction_items_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transaction_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_sku_key" ON "inventory_items"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_serviceTag_key" ON "inventory_items"("serviceTag");

-- CreateIndex
CREATE INDEX "inventory_items_category_idx" ON "inventory_items"("category");

-- CreateIndex
CREATE INDEX "inventory_items_model_idx" ON "inventory_items"("model");

-- CreateIndex
CREATE INDEX "inventory_items_status_idx" ON "inventory_items"("status");

-- CreateIndex
CREATE INDEX "inventory_items_currency_idx" ON "inventory_items"("currency");

-- CreateIndex
CREATE INDEX "inventory_items_warehouseId_idx" ON "inventory_items"("warehouseId");

-- CreateIndex
CREATE INDEX "inventory_items_itemType_idx" ON "inventory_items"("itemType");

-- CreateIndex
CREATE INDEX "inventory_items_supplierId_idx" ON "inventory_items"("supplierId");

-- CreateIndex
CREATE INDEX "inventory_items_assignedToUserId_idx" ON "inventory_items"("assignedToUserId");

-- CreateIndex
CREATE INDEX "audit_logs_entityId_idx" ON "audit_logs"("entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "transactions_sourceWarehouseId_idx" ON "transactions"("sourceWarehouseId");

-- CreateIndex
CREATE INDEX "transactions_destinationWarehouseId_idx" ON "transactions"("destinationWarehouseId");

-- CreateIndex
CREATE INDEX "transactions_userId_idx" ON "transactions"("userId");

-- CreateIndex
CREATE INDEX "transactions_date_idx" ON "transactions"("date");

-- CreateIndex
CREATE INDEX "transaction_items_transactionId_idx" ON "transaction_items"("transactionId");

-- CreateIndex
CREATE INDEX "transaction_items_inventoryItemId_idx" ON "transaction_items"("inventoryItemId");
