# Codemap Quick Reference

**Documentation Version:** 0.6.0
**Created:** 2026-04-03
**Updated:** 2026-07-07
**Framework:** NestJS 11 + Prisma 6 + TypeScript 5.7

---

## What's New (v0.6.0)

- **Sales module** — customer-tier pricing, PDF receipts, stock decrement with cancel-to-restore
- **Outflows module** — write-offs (damaged/lost/expired/consumed/sold) with PDF receipts
- **Granular RBAC** — `Role`/`Permission`/`RolePermission` tables, 55 permissions across 18 modules
- **Manual Confirmation Endpoints** — Confirm loans/transfers without QR code
- **Sequential Inventory Updates** — Prevents race conditions in concurrent transfers
- **Transaction Safety** — TOCTOU guards and atomic operations
- **Comprehensive Seed Data** — 300+ realistic items with transfers and loans

---

## Quick Links

| Need | Link |
|------|------|
| **Understand the architecture** | [INDEX.md](./docs/CODEMAPS/INDEX.md) |
| **Work on auth/permissions** | [auth-rbac.md](./docs/CODEMAPS/auth-rbac.md) |
| **CRUD inventory** | [inventory.md](./docs/CODEMAPS/inventory.md) |
| **Manual confirm loans/transfers** | [loans-transfers.md](./docs/CODEMAPS/loans-transfers.md) |
| **Database seeding** | [seed-data.md](./docs/CODEMAPS/seed-data.md) |
| **Deploy to production** | [DEPLOYMENT-GUIDE.md](./context/DEPLOYMENT-GUIDE.md) |

---

## Loans: Manual Confirmation Workflow

### Confirm Receipt (No QR)

```bash
# 1. Create loan
POST /loans
{
  "sourceWarehouseId": "w1",
  "destinationWarehouseId": "w2",
  "items": [{ "inventoryItemId": "item-1", "quantity": 1 }],
  "dueDate": "2026-04-10"
}

# 2. Send loan
PATCH /loans/:id/send

# 3. Confirm receipt WITHOUT QR
PATCH /loans/:id/manual-confirm-receipt
# Status: SENT → RECEIVED
```

**Key Guards:**
- Warehouse access check (pre-transaction)
- Status must be SENT or OVERDUE
- If OVERDUE, must NOT have receivedAt (prevent double-confirmation)

---

### Confirm Return (No QR)

```bash
# 1. Initiate return
PATCH /loans/:id/initiate-return
# Status: RECEIVED → RETURN_PENDING

# 2. Confirm return WITHOUT QR
PATCH /loans/:id/manual-confirm-return
# Status: RETURN_PENDING → RETURNED
```

**Key Guards:**
- Status must be RETURN_PENDING or OVERDUE
- If OVERDUE, must have receivedAt (can't return unreceived)

---

## Transfers: Atomically-Safe Inventory Application

### The Problem

Concurrent transfers on same item can cause negative stock:

```
Transfer A: qty=10, take 8
Transfer B: qty=10, take 9  ← both see qty=10, result: qty=1 (should fail!)
```

### The Solution

Inside `applyInventoryTransfer()` transaction:

```typescript
1. Re-validate quantities (prevents concurrent depletes)
2. Sequentially decrement source
3. Sequentially find/create destination (prevents duplicate items)
4. Update transfer status
→ All in one atomic transaction
```

### Workflow

```bash
# 1. Create transfer
POST /transfer-requests
{
  "sourceWarehouseId": "w1",
  "destinationWarehouseId": "w2",
  "items": [{ "inventoryItemId": "item-1", "quantity": 5 }]
}

# 2. Approve
PATCH /transfer-requests/:id/approve

# 3. Send (generate QR)
PATCH /transfer-requests/:id/send

# 4. Confirm receipt (triggers applyInventoryTransfer)
POST /transfer-requests/confirm-receipt
{ "qrCode": "..." }
# → Atomically decrements source, increments destination
```

---

## Seed Data

### Run Full Seed

```bash
npm run seed
# Creates:
# - 10 users (2 admin, 2 manager, 2 user, 2 viewer, 2 external)
# - 3 warehouses (regional)
# - 10 suppliers
# - 6 categories
# - 300+ inventory items
# - 50+ transactions
# - 20+ transfers (PENDING → COMPLETED)
# - 15+ loans (using manual confirmation)
```

### Test Data After Seed

```bash
# Users
email: admin@example.com
email: manager@example.com
password: TestPassword123! (all users)

# Warehouses
w1: Bodega Principal (Electronics focus)
w2: Bodega Norte (Furniture focus)
w3: Bodega Sur (Hardware focus)

# Items
300+ items across 6 categories
60+ UNIQUE items (with serviceTag)
240+ BULK items (consumables)
```

---

## Permission System (55 Permissions)

### Example: Loans

```
loans:view     → Can list and view loans
loans:create   → Can create new loans
loans:manage   → Can send, confirm, return loans
loans:delete   → Can delete loans
```

### Route Protection

```typescript
@Get()
@Permissions('loans:view')  // User needs this permission
getLoans() { ... }

@Patch(':id/manual-confirm-receipt')
@Permissions('loans:manage')  // User needs this permission
confirmReceipt(@Param('id') id: string) { ... }
```

### Current Roles

| Role | Key Permissions | Purpose |
|------|-----------------|---------|
| SYSTEM_ADMIN | All 55 permissions | Full access |
| WAREHOUSE_MANAGER | 25 permissions | Operations manager |
| USER | 15 permissions | Warehouse staff |
| VIEWER | 8 permissions | Read-only |
| EXTERNAL | 5 permissions | External partners |

---

## API Endpoints Summary

### Auth (13 endpoints)

```http
POST   /auth/login                     # Login
POST   /auth/logout                    # Logout
POST   /auth/refresh                   # Refresh token
GET    /auth/me                        # Get profile + permissions
POST   /auth/register                  # Sign up
POST   /auth/forgot-password           # Request reset
POST   /auth/reset-password            # Reset via token
PATCH  /auth/change-password           # Change password
```

### Loans (14 endpoints including manual)

```http
POST   /loans                          # Create
PATCH  /loans/:id/send                 # Send (generate QR)
PATCH  /loans/:id/manual-confirm-receipt   # Manual confirm (NEW)
PATCH  /loans/:id/manual-confirm-return    # Manual return (NEW)
PATCH  /loans/:id/initiate-return      # Mark return pending
GET    /loans                          # List
GET    /loans/:id                      # Detail
# ... more
```

### Transfers (13 endpoints)

```http
POST   /transfer-requests              # Create
PATCH  /transfer-requests/:id/approve  # Approve
PATCH  /transfer-requests/:id/send     # Send (QR)
POST   /transfer-requests/confirm-receipt  # Confirm (executes applyInventoryTransfer)
PATCH  /transfer-requests/:id/complete    # Manual complete
GET    /transfer-requests              # List
# ... more
```

### Outflows (6 endpoints)

```http
POST   /outflows                       # Create write-off (decrements stock)
GET    /outflows                       # List
GET    /outflows/stats                 # Outflow statistics
GET    /outflows/:id                   # Detail
GET    /outflows/:id/pdf               # PDF receipt
PATCH  /outflows/:id/cancel            # Cancel (restores stock)
```

### Sales (6 endpoints)

```http
POST   /sales                          # Create sale (decrements stock)
GET    /sales                          # List
GET    /sales/stats                    # Sales statistics
GET    /sales/:id                      # Detail
GET    /sales/:id/pdf                  # PDF receipt
PATCH  /sales/:id/cancel               # Cancel (restores stock)
```

### Inventory (16 endpoints)

```http
POST   /inventory                      # Create item
POST   /inventory/bulk/import          # Bulk import from Excel
PATCH  /inventory/bulk/update          # Bulk update
DELETE /inventory/bulk/delete          # Bulk delete
POST   /inventory/bulk/restore         # Restore deleted
GET    /inventory                      # List
GET    /inventory/:id                  # Detail
# ... more
```

---

## Database Schema: Key Entities

### Loan

```typescript
status: PENDING | SENT | RECEIVED | RETURN_PENDING | RETURNED | OVERDUE | CANCELLED
receivedAt: Date | null     // Set on manual-confirm-receipt
returnConfirmedAt: Date | null  // Set on manual-confirm-return
```

### TransferRequest

```typescript
status: PENDING | APPROVED | SENT | COMPLETED | REJECTED | CANCELLED
receivedAt: Date | null     // Set when inventory transferred
```

### InventoryItem

```typescript
itemType: UNIQUE | BULK
status: IN_STOCK | LOW_STOCK | OUT_OF_STOCK | DISCONTINUED
quantity: Int
warehouseId: String
```

---

## Performance Tips

### Pagination

Always paginate list endpoints:

```bash
GET /inventory?page=1&limit=10      # Default limit=10
GET /loans?page=2&limit=20          # Custom limit
```

### Filtering

Use warehouse access control:

```typescript
// User is restricted to w1, w2
GET /transfer-requests
// Auto-filtered to show transfers where they're source or destination
```

### Permission Caching

Permissions are cached for 60 seconds:

```typescript
// First request: DB query
// Next 59 seconds: Cache hit
// After 60 sec: Re-fetch from DB
```

---

## Testing Checklist

- [ ] **Create loan** → POST /loans
- [ ] **Manual confirm receipt** → PATCH /loans/:id/manual-confirm-receipt
- [ ] **Manual confirm return** → PATCH /loans/:id/manual-confirm-return
- [ ] **Create transfer** → POST /transfer-requests
- [ ] **Approve transfer** → PATCH /transfer-requests/:id/approve
- [ ] **Send transfer** → PATCH /transfer-requests/:id/send
- [ ] **Confirm transfer receipt** → POST /transfer-requests/confirm-receipt
- [ ] **Verify inventory updated** → GET /inventory (source decreased, dest increased)
- [ ] **Check audit logs** → GET /audit (events logged with manual confirmation flag)

---

## Security Checklist

- [x] **JWT tokens** via HttpOnly cookies
- [x] **CSRF protection** double submit pattern
- [x] **Password hashing** bcryptjs (salt=10)
- [x] **Strong password** policy enforced
- [x] **Warehouse access** control per user
- [x] **Granular permissions** 55 permissions across 18 modules
- [x] **Rate limiting** per IP, per minute, per hour
- [x] **Helmet headers** CSP, HSTS, X-Frame-Options
- [x] **Audit trail** all operations logged
- [x] **Transaction safety** sequential updates prevent race conditions

---

## Common Issues & Solutions

### "Cannot confirm receipt. Loan is in SENT status."
- The loan status is not SENT or OVERDUE
- Check: `GET /loans/:id` and see actual status
- Possible statuses: PENDING, SENT, RECEIVED, RETURN_PENDING, RETURNED, CANCELLED

### "Insufficient quantity for item"
- Source warehouse doesn't have enough stock
- Check: `GET /inventory/:itemId` quantity vs. transfer request quantity
- May be in-transit on another transfer

### "User not found"
- JWT token expired or invalid
- Refresh: `POST /auth/refresh`
- Or re-login: `POST /auth/login`

### "Missing required permission: loans:manage"
- User role doesn't have the permission
- Check user's role: `GET /auth/me` → roleId
- Admin must assign role or update role permissions

---

## Deployment Checklist

- [ ] Environment variables configured (.env.prod)
- [ ] Database migrated (railway:migrate)
- [ ] Seed data applied (npm run seed:prod)
- [ ] Admin user created
- [ ] RBAC permissions seeded
- [ ] Helmet headers configured
- [ ] CORS allowed origins set
- [ ] Rate limiting configured
- [ ] Logging to file enabled
- [ ] Health check passing (GET /health)

---

## Support

- **Docs:** See [docs/CODEMAPS/](./docs/CODEMAPS/)
- **API Docs:** GET /api/docs (Swagger UI)
- **Issues:** GitHub issues
- **Questions:** Mario Herrera (see [README.md](./README.md))

---

**Last Updated:** 2026-07-07 | **Version:** 0.6.0 | **Status:** Current
