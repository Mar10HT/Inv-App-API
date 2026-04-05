# Inventory Module Codemap

**Last Updated:** 2026-04-03
**Module:** `src/inventory`
**Key Features:** CRUD, bulk operations, soft deletes, filtering, status tracking

---

## Overview

The Inventory module handles all item-level stock management across warehouses. It supports:

- **CRUD operations** with pagination and filtering
- **Bulk operations** — import, update, delete multiple items
- **Soft deletes** — `deletedAt` field for non-destructive removal
- **Status tracking** — IN_STOCK, LOW_STOCK, OUT_OF_STOCK, DISCONTINUED
- **Excel export** — Template generation + bulk import
- **Filtering** — By warehouse, category, status, supplier, item type (UNIQUE vs BULK)

---

## Files & Entry Points

| File | Purpose | Lines |
|------|---------|-------|
| `inventory.controller.ts` | 16 REST endpoints | ~300 |
| `inventory.service.ts` | Business logic, bulk ops | ~500 |
| `inventory.module.ts` | Module definition | ~30 |
| `entities/inventory.entity.ts` | Response DTOs | ~50 |
| `dto/create-inventory.dto.ts` | Input validation | ~40 |
| `dto/filter-inventory.dto.ts` | Query filtering | ~30 |
| `dto/bulk-operations.dto.ts` | Bulk operation payloads | ~30 |
| `dto/stats-response.dto.ts` | Statistics response | ~30 |
| `dto/paginated-response.dto.ts` | Pagination envelope | ~20 |

---

## API Endpoints

### Standard CRUD

```http
POST   /inventory                      # Create item
GET    /inventory                      # List all (paginated, filterable)
GET    /inventory/:id                  # Get detail
PATCH  /inventory/:id                  # Update item
DELETE /inventory/:id                  # Soft delete
```

### Bulk Operations

```http
POST   /inventory/bulk/import          # Import from Excel
PATCH  /inventory/bulk/update          # Update multiple items
DELETE /inventory/bulk/delete          # Soft delete multiple
POST   /inventory/bulk/restore         # Restore deleted items
```

### Utilities

```http
GET    /inventory/excel-template       # Download Excel template
GET    /inventory/stats                # Inventory statistics
GET    /inventory/low-stock            # Low stock items
GET    /inventory/by-warehouse/:id     # Items in warehouse
GET    /inventory/by-category/:id      # Items in category
```

---

## Data Model

```typescript
model InventoryItem {
  id                String   @id @default(cuid())

  // Basic info
  name              String
  description       String?
  sku               String?   @unique
  category          String?
  price             Float?
  currency          String?   @default("USD")

  // Warehouse & supplier
  warehouse         Warehouse @relation(fields: [warehouseId], references: [id])
  warehouseId       String
  supplier          Supplier? @relation(fields: [supplierId], references: [id])
  supplierId        String?

  // Stock tracking
  quantity          Int
  minQuantity       Int       @default(5)
  status            InventoryStatus  // IN_STOCK, LOW_STOCK, OUT_OF_STOCK, DISCONTINUED
  itemType          ItemType         // UNIQUE (1 unit) or BULK (multiple units)

  // Asset tracking (for UNIQUE items like laptops)
  serviceTag        String?   @unique

  // Timestamps
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?  // Soft delete flag

  // Relations
  transactions      Transaction[]
  loanItems         LoanItem[]
  transferItems     TransferRequestItem[]

  @@unique([warehouseId, name, category])
}
```

---

## Key Service Methods

### `create(dto, userId)`

**Purpose:** Create a single inventory item.

**Validations:**
- Warehouse exists
- SKU is unique (if provided)
- Warehouse has capacity/limit (optional)
- Required fields present (name, warehouseId)

**Returns:** Created item with full details

**Audit:** Logs CREATE action

---

### `findAll(pagination, filters)`

**Purpose:** Fetch paginated, filtered inventory list.

**Filters:**
- `warehouseId` — by warehouse
- `categoryId` — by category
- `supplierId` — by supplier
- `status` — IN_STOCK, LOW_STOCK, OUT_OF_STOCK
- `itemType` — UNIQUE or BULK
- `search` — name/description/SKU partial match
- `includeDeleted` — show soft-deleted items

**Pagination:** `page` (default 1), `limit` (default 10)

**Returns:**
```json
{
  "data": [{ id, name, quantity, status, ... }],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 10,
    "totalPages": 15
  }
}
```

---

### `update(id, dto, userId)`

**Purpose:** Update inventory item.

**Allowed Fields:**
- `name`, `description`, `sku`
- `price`, `currency`
- `quantity`, `minQuantity`
- `status`, `itemType`
- `supplierId`, `category`
- `serviceTag` (for UNIQUE items)

**Status Auto-Calculation:**
```typescript
function updateStatus(quantity, minQuantity, itemType) {
  if (itemType === UNIQUE) {
    return quantity === 1 ? IN_STOCK : OUT_OF_STOCK;
  }
  if (quantity === 0) return OUT_OF_STOCK;
  if (quantity <= minQuantity) return LOW_STOCK;
  return IN_STOCK;
}
```

**Audit:** Logs UPDATE with field changes

---

### `bulkImport(file, warehouseId, userId)`

**Purpose:** Import items from Excel file.

**Expected Columns:**
```
name, description, sku, category, price, currency, quantity, minQuantity, supplierId, itemType, serviceTag
```

**Logic:**
1. Parse Excel file
2. Validate each row (schema validation)
3. Create missing categories/suppliers
4. Bulk create items (single INSERT)
5. Return { created: N, skipped: M, errors: [] }

**Transactional:** All-or-nothing (single `prisma.$transaction`)

**Returns:**
```json
{
  "created": 250,
  "skipped": 3,
  "errors": [
    { "row": 10, "error": "Invalid price: abc" }
  ]
}
```

---

### `bulkUpdate(items, userId)`

**Purpose:** Update multiple items at once.

**Payload:**
```json
[
  { "id": "item-1", "quantity": 50, "status": "IN_STOCK" },
  { "id": "item-2", "quantity": 0, "status": "OUT_OF_STOCK" }
]
```

**Logic:**
1. Validate all items exist
2. Bulk update (batched)
3. Log audit entry for each

**Transactional:** All-or-nothing

---

### `bulkDelete(ids, userId)`

**Purpose:** Soft delete multiple items.

**Action:** Set `deletedAt` timestamp on matching items

**Guard:** Only delete items with no active loans/transfers

**Returns:** { deleted: N }

---

### `bulkRestore(ids, userId)`

**Purpose:** Restore soft-deleted items.

**Action:** Clear `deletedAt` timestamp

**Returns:** { restored: N }

---

### `getStats(warehouseIds?)`

**Purpose:** Inventory statistics.

**Returns:**
```json
{
  "totalItems": 1500,
  "inStock": 1200,
  "lowStock": 250,
  "outOfStock": 50,
  "discontinued": 0,
  "totalValue": 250000.00,
  "uniqueItems": 450,
  "bulkItems": 1050,
  "byWarehouse": [
    { "warehouseId": "w1", "itemCount": 500, "value": 100000 }
  ],
  "byCategory": [
    { "category": "Electronics", "itemCount": 200, "value": 80000 }
  ]
}
```

---

## Filtering & Search

### Soft Delete Handling

By default, list endpoints **exclude deleted items** (where `deletedAt` IS NULL).

**Include deleted:** Pass `includeDeleted=true` to GET /inventory

---

### Warehouse Access Control

If user is warehouse-restricted (not admin):

```typescript
// Auto-filter to user's warehouses
const filters = {
  warehouseId: { in: user.warehouseIds }
}
```

If user is admin (`warehouseIds === null`):
- Can access all warehouses
- No warehouse filter applied

---

## Status Machine

```
       create(qty=0)
            ↓
      OUT_OF_STOCK
            ↑↓
       LOW_STOCK  ←─ qty ≤ minQuantity
            ↑↓
       IN_STOCK   ←─ qty > minQuantity
            ↑
      DISCONTINUED (manual)
```

**Auto Status Update Rules:**

For UNIQUE items (`itemType: UNIQUE`):
- `qty === 1` → IN_STOCK
- `qty === 0` → OUT_OF_STOCK

For BULK items (`itemType: BULK`):
- `qty === 0` → OUT_OF_STOCK
- `0 < qty ≤ minQuantity` → LOW_STOCK
- `qty > minQuantity` → IN_STOCK

---

## Excel Import/Export

### Template Download

`GET /inventory/excel-template`

**Returns:** Excel file with header row:

```
| name | description | sku | category | price | currency | quantity | minQuantity | supplierId | itemType | serviceTag |
```

### Bulk Import

`POST /inventory/bulk/import`

**Payload:** Form-data with `file` field (Excel)

**Parsing Logic:**
1. Read Excel rows (skip header)
2. Map columns to InventoryItem fields
3. Validate each row via DTO
4. Auto-create missing categories + suppliers
5. Bulk insert in single transaction

**Error Handling:** Partial success allowed (skip invalid rows, log errors)

---

## Item Types

### UNIQUE Items

**Use Case:** Serialized assets (laptops, monitors, equipment with serial numbers)

**Properties:**
- Must have `serviceTag` (asset tag)
- Status is binary: IN_STOCK (qty=1) or OUT_OF_STOCK (qty=0)
- Typically loaned individually

**Example:**
```json
{
  "name": "Laptop Dell XPS 15",
  "itemType": "UNIQUE",
  "serviceTag": "DEL-456789-AB",
  "quantity": 1,
  "status": "IN_STOCK"
}
```

---

### BULK Items

**Use Case:** Consumables and supplies (paper, pens, cables)

**Properties:**
- Status follows qty → minQuantity logic
- Can have fractional pricing
- Multiple units in stock

**Example:**
```json
{
  "name": "Paper A4 (Box 10 reams)",
  "itemType": "BULK",
  "quantity": 25,
  "minQuantity": 5,
  "status": "IN_STOCK"
}
```

---

## Audit Trail

### Tracked Events

- **CREATE** — New item created
- **UPDATE** — Item modified (which fields changed)
- **DELETE** — Item soft-deleted
- **RESTORE** — Deleted item restored
- **BULK_IMPORT** — Multiple items imported (single entry with count)
- **BULK_UPDATE** — Multiple items updated (single entry with count)

### Audit Payload Example

```json
{
  "action": "UPDATE",
  "entity": "InventoryItem",
  "entityId": "item-123",
  "userId": "user-456",
  "changes": {
    "quantity": { "from": 50, "to": 45 },
    "status": { "from": "IN_STOCK", "to": "IN_STOCK" }
  },
  "timestamp": "2026-04-03T10:30:00Z"
}
```

---

## Performance Considerations

### Indexes

Recommended database indexes:

```sql
CREATE INDEX idx_inventory_warehouse ON InventoryItem(warehouseId);
CREATE INDEX idx_inventory_status ON InventoryItem(status);
CREATE INDEX idx_inventory_deleted ON InventoryItem(deletedAt);
CREATE INDEX idx_inventory_category ON InventoryItem(category);
CREATE INDEX idx_inventory_sku ON InventoryItem(sku);
```

### Query Optimization

- **Pagination mandatory:** Default limit = 10, no full-table scans
- **Eager loading:** Service methods use `include` for related data
- **Soft delete filter:** Always applied (no need to filter in every query)

### Bulk Operation Batching

For bulk imports > 1000 items:

```typescript
// Split into batches to avoid transaction memory limits
const BATCH_SIZE = 500;
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  const batch = items.slice(i, i + BATCH_SIZE);
  await this.createBatch(batch);
}
```

---

## External Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `exceljs` | Excel import/export | 4.4.0 |
| `@prisma/client` | ORM | 6.19.0 |
| `class-validator` | DTO validation | 0.14.3 |

---

## Related Areas

- **[Warehouses Module](./warehouses.md)** — Item allocation across warehouses
- **[Loans Module](./loans-transfers.md)** — Item lending
- **[Transfer Module](./loans-transfers.md)** — Inter-warehouse movement
- **[Reports Module](./reporting.md)** — Inventory value/status analytics
- **[Transactions Module](./transactions.md)** — Stock entries/exits

---

## Quick Reference

### Common Workflows

**Create Single Item:**
```bash
POST /inventory
Content-Type: application/json

{
  "name": "Monitor Dell 27\"",
  "warehouseId": "w1",
  "quantity": 5,
  "minQuantity": 2,
  "price": 300,
  "category": "Electronics",
  "itemType": "BULK"
}
```

**Import from Excel:**
```bash
POST /inventory/bulk/import
Content-Type: multipart/form-data

file: <excel-file.xlsx>
warehouseId: w1
```

**List by Status:**
```bash
GET /inventory?status=LOW_STOCK&warehouseId=w1&limit=20
```

**Soft Delete + Restore:**
```bash
DELETE /inventory/bulk/delete
Content-Type: application/json

{ "ids": ["item1", "item2"] }

# Later, restore:
POST /inventory/bulk/restore
{ "ids": ["item1", "item2"] }
```

---

**Last Updated:** 2026-04-03 | **Maintainer:** Mario Herrera
