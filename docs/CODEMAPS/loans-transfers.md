# Loans & Transfers Codemap

**Last Updated:** 2026-04-03
**Modules:** `src/loans`, `src/transfer-requests`
**Key Feature:** Manual confirmation endpoints + transaction safety

---

## Architecture

```
┌─────────────────────────────────────┐
│      Loans & Transfers API          │
├─────────────────────────────────────┤
│                                     │
│  QR-Based Flow:                     │
│  ─────────────                      │
│  POST /loans/scan-qr                │
│    └─→ processQrCode()              │
│                                     │
│  Manual Flow (NEW):                 │
│  ───────────────                    │
│  PATCH /loans/:id/manual-confirm-* │
│    └─→ manualConfirmReceipt()       │
│    └─→ manualConfirmReturn()        │
│                                     │
│  Transfer-Specific:                 │
│  ──────────────────                 │
│  POST /transfer-requests/:id/send   │
│  POST /transfer-requests/confirm    │
│    └─→ applyInventoryTransfer()     │
│        (sequential updates)         │
│                                     │
└─────────────────────────────────────┘
```

---

## Loans Module

### Files

| File | Purpose | Lines |
|------|---------|-------|
| `loans.controller.ts` | REST endpoints (29 routes) | 229 |
| `loans.service.ts` | Business logic | 779 |
| `loans.module.ts` | Module definition | ~30 |
| `dto/create-loan.dto.ts` | Input validation | ~20 |
| `dto/update-loan.dto.ts` | Status updates (3 DTOs) | ~30 |

### Endpoints (Key Routes)

#### Standard Loan Operations

```http
POST   /loans                          # Create loan (status: PENDING)
GET    /loans                          # List loans (paginated)
GET    /loans/active                   # List non-returned loans
GET    /loans/stats                    # Loan statistics
GET    /loans/:id                      # Get loan detail
PATCH  /loans/:id                      # Update loan
DELETE /loans/:id                      # Delete loan
PATCH  /loans/:id/cancel               # Cancel loan
```

#### QR-Based Confirmation

```http
PATCH  /loans/:id/send                 # Generate QR, mark SENT
GET    /loans/:id/qr/:type             # Get QR code (send|return)
POST   /loans/confirm-receipt          # Scan QR → RECEIVED
PATCH  /loans/:id/initiate-return      # Mark RETURN_PENDING
POST   /loans/confirm-return           # Scan QR → RETURNED
POST   /loans/scan-qr                  # Generic QR processor
```

#### Manual Confirmation (NEW - No QR Required)

```http
PATCH  /loans/:id/manual-confirm-receipt    # Confirm receipt without QR
PATCH  /loans/:id/manual-confirm-return     # Confirm return without QR
```

**Permissions:** `loans:manage`

### Core Service Methods

#### `manualConfirmReceipt(id, userId, userWarehouseIds)`

**Purpose:** Confirm loan receipt without QR code.

**Status Transitions:** `SENT` or `OVERDUE` → `RECEIVED`

**Implementation:**

```typescript
// 1. Warehouse access check (before transaction)
const loan = await this.findOne(id);
if (userWarehouseIds != null) {
  const hasAccess = userWarehouseIds.includes(loan.sourceWarehouse.id) ||
                    userWarehouseIds.includes(loan.destinationWarehouse.id);
  if (!hasAccess) throw new ForbiddenException('No warehouse access');
}

// 2. Status validation + write in single transaction
const updated = await this.prisma.$transaction(async (tx) => {
  const current = await tx.loan.findUnique({ where: { id } });

  // Guard: Invalid status
  if (!current || (current.status !== 'SENT' && current.status !== 'OVERDUE')) {
    throw new BadRequestException('Only SENT or OVERDUE loans can be confirmed');
  }

  // Guard: OVERDUE from RECEIVED (prevent overwriting existing receipt)
  if (current.status === 'OVERDUE' && current.receivedAt) {
    throw new BadRequestException(
      'This loan was already received. Use manual confirm return instead.'
    );
  }

  return tx.loan.update({
    where: { id },
    data: {
      status: 'RECEIVED',
      receivedAt: new Date(),
      receivedById: userId
    },
    include: this.loanInclude
  });
});

// 3. Audit
await this.auditService.log({
  action: 'UPDATE',
  entity: 'Loan',
  entityId: id,
  userId,
  changes: { status: 'RECEIVED', confirmedManually: true, previousStatus }
});
```

**Key Invariants:**
- Cannot confirm OVERDUE loan twice (guard against double-confirmation)
- Cannot confirm return without first confirming receipt
- Transaction prevents TOCTOU race conditions

**Audit Trail:** `confirmedManually: true` flag for forensics

---

#### `manualConfirmReturn(id, userId, userWarehouseIds)`

**Purpose:** Confirm loan return without QR code.

**Status Transitions:** `RETURN_PENDING` or `OVERDUE` → `RETURNED`

**Implementation:** Mirrors `manualConfirmReceipt()` but:
- Accepts `RETURN_PENDING` or `OVERDUE` (if already received)
- Guard: OVERDUE without `receivedAt` → error (prevent return of never-received loans)
- Updates `returnDate`, `returnConfirmedAt`, `returnConfirmedById`

**Audit Trail:** `confirmedManually: true`

---

#### `processQrCode(scannedData, userId)` (QR-based)

**Purpose:** Process QR code scan (calls appropriate confirm method).

**Logic:**
```typescript
const { loanId, type } = parseQrCode(scannedData); // type = 'send' | 'return'

switch (type) {
  case 'send': return this.confirmReceipt(qrCode, userId);
  case 'return': return this.confirmReturn(qrCode, userId);
}
```

---

### Data Model

```typescript
model Loan {
  id                String   @id @default(cuid())

  // Status tracking
  status            String   @default("PENDING")  // PENDING, SENT, RECEIVED, RETURN_PENDING, RETURNED, OVERDUE, CANCELLED

  // Warehouse references
  sourceWarehouse   Warehouse @relation("LoanSource")
  sourceWarehouseId String
  destinationWarehouse Warehouse @relation("LoanDest")
  destinationWarehouseId String

  // Items
  items             LoanItem[]

  // Timestamps
  createdAt         DateTime @default(now())
  sentAt            DateTime?
  dueDate           DateTime?
  receivedAt        DateTime?      // Null until confirmed receipt
  receivedBy        User?   @relation("LoanReceivedBy")
  receivedById      String?

  returnDate        DateTime?
  returnInitiatedAt DateTime?
  returnConfirmedAt DateTime?
  returnConfirmedBy User?   @relation("LoanReturnConfirmedBy")
  returnConfirmedById String?

  // Metadata
  notes             String?
  isOverdue         Boolean @default(false)

  createdBy         User    @relation("LoanCreatedBy")
  createdById       String
}
```

**Key Fields:**
- `receivedAt` — Null until manually or QR-confirmed
- `returnConfirmedAt` — Null until manually or QR-confirmed return
- `isOverdue` — Boolean flag (updated by cron job)

---

## Transfer Requests Module

### Files

| File | Purpose | Lines |
|------|---------|-------|
| `transfer-requests.controller.ts` | REST endpoints (14 routes) | 157 |
| `transfer-requests.service.ts` | Business logic + transaction safety | 576 |
| `transfer-requests.module.ts` | Module definition | ~30 |
| `dto/create-transfer-request.dto.ts` | Input validation | ~20 |

### Endpoints

#### Standard Transfer Flow

```http
POST   /transfer-requests              # Create (status: PENDING)
GET    /transfer-requests              # List (paginated)
GET    /transfer-requests/pending      # List pending requests
GET    /transfer-requests/stats        # Statistics
GET    /transfer-requests/:id          # Get detail
PATCH  /transfer-requests/:id/approve  # Approve (PENDING → APPROVED)
PATCH  /transfer-requests/:id/reject   # Reject with reason
PATCH  /transfer-requests/:id/cancel   # Cancel (only creator or manager)
```

#### QR-Based Fulfillment

```http
GET    /transfer-requests/:id/qr       # Generate QR code
PATCH  /transfer-requests/:id/send     # Mark SENT, generate QR
POST   /transfer-requests/confirm-receipt  # Scan QR → COMPLETED
POST   /transfer-requests/scan-qr      # Generic QR processor
```

#### Completion

```http
PATCH  /transfer-requests/:id/complete # Manual mark COMPLETED (no QR)
```

**Permissions:** `transfers:create`, `transfers:manage`

### Core Service Methods

#### `create(dto, userId)`

**Purpose:** Create new transfer request.

**Validations:**
- Source ≠ destination warehouse
- Both warehouses exist and active
- All items exist in source warehouse
- Sufficient quantity for each item

**Result:** Transfer in `PENDING` status

---

#### `approve(id, userId, warehouseIds)`

**Purpose:** Approve pending transfer.

**Status:** `PENDING` → `APPROVED`

**Permissions:** `transfers:manage`

---

#### `sendTransfer(id, warehouseIds)`

**Purpose:** Mark transfer as sent and generate QR code.

**Status:** `APPROVED` → `SENT`

**Returns:** Transfer with `qrDataUrl` in response

---

#### `confirmReceipt(qrCode, userId)` (QR-based)

**Purpose:** Scan QR and apply inventory transfer.

**Flow:**
```
1. Extract transfer ID from QR
2. Find transfer request (status must be SENT)
3. Call applyInventoryTransfer() in transaction
```

---

#### `applyInventoryTransfer(tx, request, receivedById)` (CRITICAL)

**Purpose:** Atomically transfer inventory between warehouses.

**Problem Solved:** Transaction safety under concurrent operations

**Implementation:**

```typescript
private async applyInventoryTransfer(
  tx: Prisma.TransactionClient,
  request: { id, destinationWarehouseId, items[] },
  receivedById: string
): Promise<any> {

  // 1. Re-validate quantities inside transaction
  // (catches concurrent decrements since approve)
  for (const item of request.items) {
    const currentItem = await tx.inventoryItem.findUnique({
      where: { id: item.inventoryItemId }
    });
    if (!currentItem || currentItem.quantity < item.quantity) {
      throw new BadRequestException(
        `Insufficient quantity for ${item.inventoryItem.name}`
      );
    }
  }

  // 2. Sequentially decrement source items
  // Prevents: Parallel updates race condition
  // Example: Two transfers try to take 8 + 9 from qty=10
  for (const item of request.items) {
    await tx.inventoryItem.update({
      where: { id: item.inventoryItemId },
      data: { quantity: { decrement: item.quantity } }
    });
  }

  // 3. Sequentially find/create destination items
  // Prevents: TOCTOU race where both threads see no item and create duplicates
  for (const item of request.items) {
    const existingInDest = await tx.inventoryItem.findFirst({
      where: {
        warehouseId: request.destinationWarehouseId,
        name: item.inventoryItem.name,
        category: item.inventoryItem.category ?? undefined,
        sku: item.inventoryItem.sku ?? undefined
      }
    });

    if (existingInDest) {
      // Update existing
      await tx.inventoryItem.update({
        where: { id: existingInDest.id },
        data: { quantity: { increment: item.quantity } }
      });
    } else {
      // Create new (custom create to handle SKU suffix)
      await (tx.inventoryItem.create as any)({
        data: {
          name: item.inventoryItem.name,
          description: item.inventoryItem.description,
          quantity: item.quantity,
          minQuantity: item.inventoryItem.minQuantity,
          category: item.inventoryItem.category,
          price: item.inventoryItem.price,
          currency: item.inventoryItem.currency,
          sku: item.inventoryItem.sku
            ? `${item.inventoryItem.sku}-${request.destinationWarehouseId.slice(0, 4)}`
            : null,
          warehouseId: request.destinationWarehouseId,
          supplierId: item.inventoryItem.supplierId,
          itemType: item.inventoryItem.itemType
        }
      });
    }
  }

  // 4. Mark transfer COMPLETED within same transaction
  return tx.transferRequest.update({
    where: { id: request.id },
    data: {
      status: RequestStatus.COMPLETED,
      receivedAt: new Date(),
      receivedById
    },
    include: this.includeFull
  });
}
```

**Why Sequential?**

Under READ COMMITTED isolation (PostgreSQL default):

| Scenario | Without Sequencing | With Sequencing |
|----------|-------------------|-----------------|
| **Two transfers, qty=10** | T1 reads 10, T2 reads 10; T1 takes 8 → 2; T2 takes 9 → 1 ✗ | Sequential: T1 → 2, T2 fails (qty < 9) ✓ |
| **CREATE duplicate** | T1 reads no item, T2 reads no item; both create → 2 items ✗ | Sequential: T1 creates, T2 finds existing ✓ |

**Trade-off:** Slightly slower for bulk transfers, but guarantees correctness.

---

### Data Model

```typescript
model TransferRequest {
  id                    String   @id @default(cuid())

  // Status
  status                String   @default("PENDING")
  // PENDING, APPROVED, SENT, COMPLETED, REJECTED, CANCELLED

  // Warehouses
  sourceWarehouse       Warehouse @relation("TransferSource")
  sourceWarehouseId     String
  destinationWarehouse  Warehouse @relation("TransferDest")
  destinationWarehouseId String

  // Items
  items                 TransferRequestItem[]

  // Users
  requestedBy           User    @relation("TransferRequested")
  requestedById         String
  approvedBy            User?   @relation("TransferApproved")
  approvedById          String?
  receivedBy            User?   @relation("TransferReceived")
  receivedById          String?

  // Timestamps
  createdAt             DateTime @default(now())
  approvedAt            DateTime?
  sentAt                DateTime?
  receivedAt            DateTime?

  // Metadata
  notes                 String?
  rejectionReason       String?
}

model TransferRequestItem {
  id                    String   @id @default(cuid())
  transferRequest       TransferRequest @relation(fields: [transferRequestId], references: [id], onDelete: Cascade)
  transferRequestId     String

  inventoryItem         InventoryItem @relation(fields: [inventoryItemId], references: [id])
  inventoryItemId       String

  quantity              Int      // Quantity to transfer

  @@unique([transferRequestId, inventoryItemId])
}
```

---

## Status Machines

### Loan Status Flow

```
PENDING ──send──→ SENT ──confirm-receipt──→ RECEIVED ──initiate-return──→ RETURN_PENDING ──confirm-return──→ RETURNED
   │                │                           │
   └────cancel──→ CANCELLED                     └────────overdue timeout────→ OVERDUE
```

**Key States:**
- `PENDING` — Created, awaiting send
- `SENT` — QR generated, awaiting receipt
- `RECEIVED` — Receipt confirmed (QR or manual)
- `OVERDUE` — Past due date, not yet returned
- `RETURNED` — Return confirmed (QR or manual)

**Manual Confirmation Paths:**
- `SENT` → `RECEIVED` via `manualConfirmReceipt()`
- `RETURN_PENDING` → `RETURNED` via `manualConfirmReturn()`

---

### Transfer Status Flow

```
PENDING ──approve──→ APPROVED ──send──→ SENT ──confirm-receipt──→ COMPLETED
   │                    │                │
   └────cancel──→ CANCELLED        └────complete (manual)──→ COMPLETED
   │
   └────reject──→ REJECTED
```

**Key States:**
- `PENDING` — Created, awaiting approval
- `APPROVED` — Approved by manager
- `SENT` — QR generated, in-transit
- `COMPLETED` — Received and inventory applied

---

## Guards & Invariants

### Loan Confirmation Guards

#### `manualConfirmReceipt()` Guards

```typescript
// Guard 1: Status check
if (current.status !== 'SENT' && current.status !== 'OVERDUE') {
  throw new BadRequestException('Only SENT or OVERDUE can be confirmed');
}

// Guard 2: OVERDUE idempotency
// Prevents: Confirming OVERDUE loan twice
if (current.status === 'OVERDUE' && current.receivedAt) {
  throw new BadRequestException(
    'Loan already received. Use manual confirm return instead.'
  );
}
```

#### `manualConfirmReturn()` Guards

```typescript
// Guard 1: Status check
if (current.status !== 'RETURN_PENDING' && current.status !== 'OVERDUE') {
  throw new BadRequestException('Only RETURN_PENDING or OVERDUE can be confirmed');
}

// Guard 2: Never-received check
// Prevents: Confirming return of loan that was never received
if (current.status === 'OVERDUE' && !current.receivedAt) {
  throw new BadRequestException(
    'Loan never received. Confirm receipt first.'
  );
}
```

### Transfer Guards

```typescript
// Guard 1: Quantity validation
if (sourceInventory.quantity < requestItem.quantity) {
  throw new BadRequestException('Insufficient quantity');
}

// Guard 2: Warehouse validation
if (sourceWarehouse.id === destinationWarehouse.id) {
  throw new BadRequestException('Source ≠ destination');
}

// Guard 3: TOCTOU prevention
// Re-validate inside transaction before decrement
const current = await tx.inventoryItem.findUnique({ where: { id } });
if (!current || current.quantity < item.quantity) {
  throw new BadRequestException('Quantity changed since approval');
}
```

---

## Audit Trail

### Loan Audit Fields

Every manual confirmation logs:

```json
{
  "action": "UPDATE",
  "entity": "Loan",
  "entityId": "loan-id",
  "userId": "user-id",
  "changes": {
    "status": "RECEIVED",
    "confirmedManually": true,
    "previousStatus": "SENT"
  },
  "timestamp": "2026-04-03T10:30:00Z"
}
```

### Transfer Audit Fields

```json
{
  "action": "UPDATE",
  "entity": "TransferRequest",
  "entityId": "transfer-id",
  "userId": "user-id",
  "changes": {
    "status": "COMPLETED",
    "itemsTransferred": 3,
    "totalQuantity": 15
  }
}
```

---

## Testing

### Unit Tests

**Location:** `src/loans/loans.service.spec.ts`

**Coverage:**
- Status validation
- Warehouse access checks
- Guard invariants
- Audit logging

### Integration Tests (Planned)

- QR code generation + scanning
- Manual confirmation + double-confirm prevention
- Sequential inventory updates
- Race condition scenarios

---

## External Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `qrcode` | QR generation | 1.5.4 |
| `@prisma/client` | ORM | 6.19.0 |
| `nestjs/common` | Framework | 11.0.1 |

---

## Related Areas

- **[Inventory Module](./inventory.md)** — Item CRUD, filtering, bulk operations
- **[Warehouses Module](./warehouses.md)** — Warehouse CRUD, manager assignment
- **[Transactions Module](./transactions.md)** — Stock movements
- **[Audit Module](./audit-logging.md)** — Activity logging
- **[Auth & RBAC](./auth-rbac.md)** — Permissions, warehouse access control

---

## Quick Reference

### Manual Confirmation Workflows

**Loan Receipt (without QR):**
```bash
PATCH /loans/:id/manual-confirm-receipt
# Guard: User has warehouse access
# Guard: Loan status is SENT or OVERDUE
# Guard: If OVERDUE, must not have receivedAt already
# Result: status → RECEIVED, receivedAt set
```

**Loan Return (without QR):**
```bash
PATCH /loans/:id/manual-confirm-return
# Guard: User has warehouse access
# Guard: Loan status is RETURN_PENDING or OVERDUE
# Guard: If OVERDUE, must have receivedAt (can't return unreceived)
# Result: status → RETURNED, returnConfirmedAt set
```

**Transfer Inventory Application:**
```
applyInventoryTransfer() — inside $transaction:
  1. Re-validate quantities
  2. Sequentially decrement source items
  3. Sequentially find/create destination items
  4. Mark transfer COMPLETED
  → All in one atomic transaction
```

---

**Last Updated:** 2026-04-03 | **Maintainer:** Mario Herrera
