# Seed Data Codemap

**Last Updated:** 2026-04-03
**Script:** `scripts/seed-data.ts`
**Purpose:** Comprehensive development database seeding with realistic data

---

## Overview

The `seed-data.ts` script populates the database with realistic development data including:

- **Users** (10 total across 5 roles)
- **Warehouses** (3 regional locations)
- **Categories** (6 product categories)
- **Suppliers** (10 suppliers across categories)
- **Inventory** (300+ items distributed across warehouses)
- **Transactions** (50+ stock movements)
- **Transfers** (20+ inter-warehouse transfers in various states)
- **Loans** (15+ loans with mixed statuses)

**Total Setup Time:** ~2-3 seconds

---

## File Structure

```
scripts/
├── seed-data.ts         # Main seed script (800+ lines)
├── seed-fake.ts         # Faker-based random seed
└── create-admin.ts      # Admin account creation utility
```

---

## Running the Seed

### Development (SQLite)

```bash
# Generate client for dev schema
npm run prisma:generate

# Clear database and seed
npx prisma migrate reset --schema=./prisma/schema.prisma

# Or manually:
npm run seed
```

### Production (PostgreSQL)

```bash
# Seed production database (Railway)
npm run seed:prod
```

---

## Data Configuration

### HNL to USD Exchange Rate

```typescript
const HNL_TO_USD_RATE = 0.04; // 1 HNL ≈ 0.04 USD
```

All prices are in USD; converted to HNL for display via frontend.

---

## Seeded Data Details

### Users (10 total)

| Name | Email | Role | Purpose |
|------|-------|------|---------|
| System Administrator | admin@example.com | SYSTEM_ADMIN | Full system access |
| Secondary Admin | admin2@example.com | SYSTEM_ADMIN | Backup admin |
| Warehouse Manager | manager@example.com | WAREHOUSE_MANAGER | Warehouse operations |
| Laura Reyes | laura.r@example.com | WAREHOUSE_MANAGER | Regional manager |
| Regular User | user@example.com | USER | Stock operations |
| Pedro Alvarado | pedro.a@example.com | USER | Warehouse staff |
| Viewer User | viewer@example.com | VIEWER | Read-only access |
| Sofia Mendez | sofia.m@example.com | VIEWER | Report reviewer |
| Carlos Martinez | carlos.m@external.hn | EXTERNAL | External partner |
| Ana Lopez | ana.l@external.hn | EXTERNAL | Supplier contact |

**Default Password:** `TestPassword123!` (all users)

---

### Warehouses (3 regional)

| Name | Location | Primary Categories | Weight |
|------|----------|-------------------|--------|
| Bodega Principal | Tegucigalpa Centro | Electronics, Computer Components | 40% |
| Bodega Norte | San Pedro Sula | Furniture, Accessories, Office Supplies | 35% |
| Bodega Sur | Choluteca | Hardware, Office Supplies | 25% |

**Weight Logic:** Distribution percentage for category-based warehouse selection (80% primary, 20% random).

---

### Categories (6 total)

1. **Electronics** — Laptops, monitors, peripherals
2. **Furniture** — Office chairs, desks, tables
3. **Hardware** — Tools, screws, fasteners
4. **Office Supplies** — Paper, pens, notepads
5. **Computer Components** — RAM, SSDs, GPUs, CPUs
6. **Accessories** — Cables, stands, cases

---

### Suppliers (10 total)

```typescript
const suppliers = [
  { name: 'Tech Solutions HN', location: 'Tegucigalpa', categories: [...] },
  { name: 'Office Depot Honduras', location: 'San Pedro Sula', categories: [...] },
  { name: 'Ferretería El Martillo', location: 'Tegucigalpa', categories: [...] },
  // ... 7 more
]
```

Each supplier is linked to specific categories; inventory randomly assigns suppliers from relevant category lists.

---

### Inventory Items (~300 items)

**Distribution by Category:**

| Category | Item Count | Example Items |
|----------|-----------|----------------|
| **Electronics** | 80+ | Laptops (UNIQUE), Monitors (UNIQUE), Keyboards (BULK), Headsets (BULK) |
| **Furniture** | 60+ | Office Chairs (BULK), Desks (BULK), Conference Tables (BULK) |
| **Hardware** | 50+ | Screws, Bolts, Nails, Tools (all BULK) |
| **Office Supplies** | 50+ | Paper, Pens, Markers, Folders (all BULK) |
| **Computer Components** | 40+ | RAM, SSDs, GPUs, CPUs (all BULK) |
| **Accessories** | 30+ | Cables, Stands, Cases (all BULK) |

**Item Generation Logic:**

```typescript
for (const category of categories) {
  const products = productsByCategory[category];
  const warehouse = getWarehouseForCategory(category, warehouses);

  for (const product of products) {
    const quantity = product.isUnique ? 1 : randomInt(5, 100);
    const price = randomPrice(product.basePrice, product.variation);

    const status = getStatus(quantity, minQuantity, itemType);
    const serviceTag = product.isUnique ? generateServiceTag() : null;

    await prisma.inventoryItem.create({
      data: {
        name: product.name,
        quantity,
        price,
        status,
        itemType: product.isUnique ? ItemType.UNIQUE : ItemType.BULK,
        serviceTag,
        warehouseId: warehouse.id,
        // ... other fields
      }
    });
  }
}
```

**Item Type Distribution:**

- **UNIQUE items:** Serialized equipment (laptops, monitors, tablets, printers)
  - Always qty = 1
  - Always have serviceTag (e.g., `DEL456789-AB`)
  - Status: IN_STOCK or OUT_OF_STOCK (binary)

- **BULK items:** Consumables and commodities
  - Random qty (5–100)
  - No serviceTag
  - Status: IN_STOCK, LOW_STOCK, or OUT_OF_STOCK based on qty vs minQuantity

---

### Transactions (50+)

**Types:**
- **ENTRY** — Incoming stock (from supplier/purchase)
- **EXIT** — Outgoing stock (sale/disposal)
- **TRANSFER** — Inter-warehouse movement

**Example Entry:**
```typescript
{
  type: 'ENTRY',
  inventoryItemId: 'item-1',
  quantity: 50,
  reference: 'PO-2026-001', // Purchase order
  notes: 'Initial stock from supplier',
  createdById: userId
}
```

**Seeding Strategy:**
- For each warehouse, create 3–5 entry transactions
- Create 2–3 exit transactions per warehouse
- Create 5–10 inter-warehouse transfers

---

### Transfers (20+ in various states)

**Status Distribution:**

| Status | Count | Purpose |
|--------|-------|---------|
| PENDING | 3 | Awaiting approval |
| APPROVED | 2 | Approved, awaiting send |
| SENT | 5 | In-transit (simulate with past sentAt) |
| COMPLETED | 10 | Delivered and inventory applied |

**Generation Logic:**

```typescript
// Create pending request
const transferRequest = await prisma.transferRequest.create({
  data: {
    sourceWarehouseId: source.id,
    destinationWarehouseId: dest.id,
    items: { create: [{ inventoryItemId, quantity }] },
    requestedById: userId,
    status: 'PENDING'
  }
});

// 50% chance: approve it
if (Math.random() < 0.5) {
  await approveTransfer(transferRequest.id, managerId);

  // 80% chance: send it
  if (Math.random() < 0.8) {
    await sendTransfer(transferRequest.id);

    // 70% chance: complete it
    if (Math.random() < 0.7) {
      await applyInventoryTransfer(transferRequest.id, userId);
    }
  }
}
```

**Mixed States:** Realistic distribution with pending, approved, sent, and completed transfers.

---

### Loans (15+ in various states)

**Status Distribution:**

| Status | Count | Purpose |
|--------|-------|---------|
| PENDING | 2 | Created, not yet sent |
| SENT | 3 | QR generated, awaiting receipt |
| RECEIVED | 5 | Receipt confirmed |
| RETURN_PENDING | 3 | Awaiting return |
| RETURNED | 2 | Returned to source |

**Generation Logic:**

```typescript
// Create loan (PENDING)
const loan = await prisma.loan.create({
  data: {
    sourceWarehouseId: source.id,
    destinationWarehouseId: dest.id,
    items: { create: [{ inventoryItemId, quantity }] },
    dueDate: futureDate(7, 30), // Due in 7–30 days
    createdById: userId
  }
});

// 70% chance: send it
if (Math.random() < 0.7) {
  await sendLoan(loan.id);

  // 80% chance: confirm receipt
  if (Math.random() < 0.8) {
    await manualConfirmReceipt(loan.id, userId); // NEW: manual confirm

    // 60% chance: initiate return
    if (Math.random() < 0.6) {
      await initiateReturn(loan.id);

      // 70% chance: confirm return
      if (Math.random() < 0.7) {
        await manualConfirmReturn(loan.id, userId); // NEW: manual confirm return
      }
    }
  }
}
```

**Key Features:**
- Mixed statuses (not all completed)
- Realistic due dates (7–30 days from now)
- Manual confirmations used (new feature in v0.5.0)
- Overdue detection ready (cron job will mark old unreturned loans)

---

## Helper Functions

### `random<T>(array: T[]): T`

Select random element from array.

```typescript
const category = random(categoryNames); // Random category
```

---

### `randomInt(min, max): number`

Random integer between min and max (inclusive).

```typescript
const qty = randomInt(5, 100); // Random quantity
```

---

### `randomPrice(basePrice, variation): number`

Price with ±variation around base.

```typescript
const price = randomPrice(1200, 500); // $1200 ± $500
```

---

### `getStatus(quantity, minQuantity, itemType): InventoryStatus`

Determine inventory status based on quantity.

```typescript
if (itemType === UNIQUE) {
  return quantity === 1 ? IN_STOCK : OUT_OF_STOCK;
}
if (quantity === 0) return OUT_OF_STOCK;
if (quantity <= minQuantity) return LOW_STOCK;
return IN_STOCK;
```

---

### `generateServiceTag(): string`

Create realistic asset tag (e.g., `DEL456789-AB`).

```typescript
const serviceTag = generateServiceTag();
// Output: DEL456789AB, HP789012CD, LEN345678EF, etc.
```

---

### `getWarehouseForCategory(categoryName, warehouses): Warehouse`

Smart warehouse selection:
- 80% chance: primary warehouse for category
- 20% chance: weighted random selection

```typescript
const warehouse = getWarehouseForCategory('Electronics', warehouses);
// Likely returns Bodega Principal (primary for Electronics)
```

---

### `generateModel(productName, category): string | null`

Generate realistic model number (60% chance).

```typescript
const model = generateModel('Monitor', 'Electronics');
// Output: "Dell P2422H" or "LG 27UL850" or null
```

---

## Data Relationships

### Entity Graph

```
User ──owns──→ InventoryItem ──belongs-to──→ Warehouse
User ──creates──→ Loan ──loans──→ LoanItem ──references──→ InventoryItem
User ──creates──→ Transfer ──transfers──→ TransferItem ──references──→ InventoryItem
User ──creates──→ Transaction ──records──→ InventoryItem
User ──assigned-to──→ Warehouse (via UserWarehouse)
```

### Referential Integrity

All foreign keys are enforced:
- User → must exist
- Warehouse → must exist
- InventoryItem → must exist in source warehouse
- Supplier → optional but must exist if provided
- Category → created on-demand if missing

---

## Customization

### Adjusting Data Volume

**More items:**
```typescript
// Increase product variation in each category
productsByCategory['Electronics'].push(
  { name: 'New Product', basePrice: 500, variation: 200, isUnique: true }
);
```

**Fewer users:**
```typescript
const usersData = [
  // Remove entries for roles not needed
  { name: 'System Administrator', email: 'admin@example.com', role: UserRole.SYSTEM_ADMIN }
];
```

**More warehouses:**
```typescript
const warehousesData = [
  // Add new warehouse
  {
    name: 'Bodega Este',
    location: 'La Paz',
    description: 'Eastern regional warehouse',
    primaryCategories: ['Hardware'],
    weight: 15
  }
];
```

---

## Performance

### Seed Duration

| Phase | Duration | Notes |
|-------|----------|-------|
| User + Role creation | ~100ms | 10 users, permissions linked |
| Warehouse creation | ~50ms | 3 warehouses |
| Supplier creation | ~100ms | 10 suppliers with category links |
| Category creation | ~50ms | 6 categories |
| Inventory items | ~800ms | 300+ items with random pricing |
| Transactions | ~300ms | 50+ transactions |
| Transfers | ~400ms | 20+ transfers with status transitions |
| Loans | ~300ms | 15+ loans with status transitions |
| **Total** | **~2–3 seconds** | Entire database bootstrap |

### Optimization Tips

**Batch inserts:** Use `prisma.inventoryItem.createMany()` for bulk items.

```typescript
await prisma.inventoryItem.createMany({
  data: items, // Array of 300+ items
  skipDuplicates: true
});
```

**Parallel creation:** Some phases can run in parallel.

```typescript
await Promise.all([
  createUsers(),
  createWarehouses(),
  createSuppliers()
]);
```

---

## Testing with Seed Data

### Common Queries

**Verify item count:**
```bash
GET http://localhost:3000/api/inventory?limit=1000
# Should return ~300 items
```

**List pending transfers:**
```bash
GET http://localhost:3000/api/transfer-requests?status=PENDING
# Should return ~3 transfers
```

**Loan statistics:**
```bash
GET http://localhost:3000/api/loans/stats
# Should show mixed statuses
```

---

## Development Workflows

### Reset Database

```bash
# Clear and reseed (dev)
npx prisma migrate reset --schema=./prisma/schema.prisma
npm run seed

# Or manual reset
npx prisma db push --schema=./prisma/schema.prisma --skip-generate --accept-data-loss
npm run seed
```

### Testing Transfers

The seed creates transfers in all statuses:

1. **PENDING:** Approve it
2. **APPROVED:** Send it (triggers QR generation)
3. **SENT:** Confirm receipt (tests inventory application)
4. **COMPLETED:** Verify destination warehouse received items

```bash
# Test the full transfer flow
TRANSFER_ID=<pending-transfer-id>

# 1. Approve
PATCH /transfer-requests/$TRANSFER_ID/approve

# 2. Send (get QR)
PATCH /transfer-requests/$TRANSFER_ID/send

# 3. Confirm receipt
POST /transfer-requests/confirm-receipt
{ "qrCode": "<qr-data-from-send>" }
```

### Testing Loans

Test manual confirmation (new feature):

```bash
# Create loan
POST /loans
{ "sourceWarehouseId": "...", "destinationWarehouseId": "...", "items": [...] }

# Send
PATCH /loans/:id/send

# Manual confirm receipt (no QR needed)
PATCH /loans/:id/manual-confirm-receipt

# Initiate return
PATCH /loans/:id/initiate-return

# Manual confirm return (no QR needed)
PATCH /loans/:id/manual-confirm-return
```

---

## Related Documentation

- **[Inventory Module](./inventory.md)** — Item structure, bulk operations
- **[Loans Module](./loans-transfers.md)** — Loan workflow
- **[Transfers Module](./loans-transfers.md)** — Transfer workflow
- **[Getting Started](../README.md#getting-started)** — Seed command
- **[seed-fake.ts](./seed-fake.ts)** — Faker-based seed for load testing

---

## Known Limitations

1. **Fixed data:** Same users/warehouses on every seed (predictable for testing)
2. **No timestamps:** Created/updated dates are current (not realistic past dates)
3. **No edge cases:** All data passes validation (tests must cover errors)
4. **Single tenant:** No multi-company data (all data in single org)

---

## Future Enhancements

- [ ] Randomized historical timestamps (past 30 days)
- [ ] Configurable seed volume (lite, medium, full)
- [ ] Role-based data filtering (show user's own data only)
- [ ] Edge case seeding (low stock, overdue, conflicts)
- [ ] Snapshot/restore functionality

---

**Last Updated:** 2026-04-03 | **Maintainer:** Mario Herrera
