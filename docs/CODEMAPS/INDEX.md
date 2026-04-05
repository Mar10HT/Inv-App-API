# Obsid API — Codemaps Index

**Last Updated:** 2026-04-03
**Version:** 0.5.0
**Framework:** NestJS 10 · Prisma 5 · TypeScript 5.7

This document provides an architectural overview of the Obsid API codebase. For detailed module documentation, see the codemaps linked below.

---

## Overview

Obsid is a RESTful inventory management backend built with NestJS and Prisma. It handles:

- **Multi-warehouse logistics** — transfers, loans, stock reconciliation
- **Granular RBAC** — 46 permissions across 14 modules with in-memory caching
- **Audit trail** — comprehensive activity logging
- **Reporting** — Excel/PDF export with analytics
- **Real-time alerts** — low stock, overdue loans, scheduled reports
- **Security** — JWT + HttpOnly cookies, CSRF, rate limiting, Helmet headers

---

## Project Structure

```
src/
├── auth/                  # JWT authentication, RBAC
├── inventory/             # Core CRUD, bulk operations, filtering
├── warehouses/            # Warehouse management + access control
├── loans/                 # Lending workflow, QR + manual confirm
├── transfer-requests/     # Inter-warehouse transfers, approval flow
├── transactions/          # Stock movements (entry, exit, transfer)
├── stock-take/            # Reconciliation, variance reporting
├── categories/            # Inventory categorization
├── suppliers/             # Supplier management
├── reports/               # Excel/PDF export
├── alerts/                # Low stock + overdue loan alerts
├── audit/                 # Activity logging
├── permissions/           # Granular RBAC service + cache
├── common/                # Shared utilities, filters, guards, DTOs
├── prisma/                # Database service
├── qr/                    # QR code generation
├── email/                 # Email notifications
└── main.ts                # App bootstrap

scripts/
├── seed-data.ts          # Comprehensive seed (users, warehouses, inventory, transfers, loans)
├── seed-fake.ts          # Faker-based seed for load testing
└── create-admin.ts       # Admin account creation utility

prisma/
├── schema.prisma         # Development schema (SQLite)
├── schema.prod.prisma    # Production schema (PostgreSQL)
└── seed.ts               # Initial seed (minimal: admin + RBAC)
```

---

## Module Codemaps

| Module | Purpose | Key Files | Entry Points |
|--------|---------|-----------|--------------|
| **[Auth & RBAC](./auth-rbac.md)** | JWT auth, permissions caching, user profile | `auth.service`, `permissions.service` | `POST /auth/login`, `GET /auth/me` |
| **[Inventory](./inventory.md)** | CRUD, bulk operations, filtering, soft deletes | `inventory.service`, `inventory.controller` | `GET/POST /inventory`, bulk endpoints |
| **[Loans](./loans-transfers.md)** | Lending workflow, QR codes, manual confirmation | `loans.service`, `loans.controller` | `POST /loans`, manual confirm endpoints |
| **[Transfers](./loans-transfers.md)** | Inter-warehouse transfers, approval flow, inventory sync | `transfer-requests.service`, controller | `POST /transfer-requests`, approval endpoints |
| **[Transactions](./transactions.md)** | Stock movements with audit trail | `transactions.service`, controller | `POST /transactions` |
| **[Warehouses](./warehouses.md)** | Warehouse CRUD, manager assignment, access control | `warehouses.service`, controller | `GET/POST /warehouses` |
| **[Reports](./reporting.md)** | Excel/PDF export, inventory analytics | `reports.service`, controller | `GET /reports/*/excel`, `/*/pdf` |
| **[Alerts](./alerts-scheduled.md)** | Low stock, overdue loans, cron scheduling | `alerts.service`, `scheduled-reports.service` | Cron jobs + manual trigger |

---

## Data Flow

### Authentication Flow

```
POST /auth/login
  ↓
auth.service.login()
  ├─ Validate credentials (bcrypt)
  ├─ Generate JWT tokens (access + refresh)
  ├─ Query PermissionsService (cache hit likely)
  └─ Return user + permissionsVersion + CSRF token
```

### Inventory Transfer Flow (With Manual Confirmation)

```
POST /transfer-requests
  ├─ Validate source/dest warehouses exist
  ├─ Validate items exist + sufficient quantity
  ├─ Create transfer request in PENDING status
  └─ Audit: CREATE TransferRequest

PATCH /transfer-requests/:id/approve
  ├─ Check permissions (transfers:manage)
  ├─ Verify request in PENDING status
  ├─ Update to APPROVED status
  └─ Audit: UPDATE TransferRequest

PATCH /transfer-requests/:id/send
  ├─ Verify APPROVED status
  ├─ Generate QR code
  ├─ Update to SENT status
  └─ Audit: UPDATE TransferRequest

POST /transfer-requests/confirm-receipt (QR-based OR manual)
  ├─ Scan QR → extract request ID
  └─ applyInventoryTransfer() in transaction:
      ├─ Re-validate quantities (prevent negative stock)
      ├─ Sequentially decrement source items
      ├─ Find/create destination items (TOCTOU-safe)
      ├─ Increment destination quantities
      ├─ Mark request COMPLETED
      └─ Audit: UPDATE TransferRequest + Inventory
```

### Loan Lifecycle (With Manual Confirmation)

```
POST /loans
  ├─ Validate items exist in source warehouse
  ├─ Create loan in PENDING status
  └─ Audit: CREATE Loan

PATCH /loans/:id/send
  ├─ Verify PENDING status
  ├─ Generate QR code
  ├─ Update to SENT status
  └─ Audit: UPDATE Loan

PATCH /loans/:id/manual-confirm-receipt (No QR required)
  ├─ Warehouse access check (pre-transaction)
  ├─ In transaction:
  │   ├─ Re-validate status is SENT or OVERDUE
  │   ├─ Guard: OVERDUE without receivedAt → error
  │   └─ Update to RECEIVED + receivedAt + receivedById
  └─ Audit: UPDATE Loan (confirmedManually: true)

PATCH /loans/:id/initiate-return
  ├─ Verify RECEIVED status
  ├─ Update to RETURN_PENDING
  └─ Audit: UPDATE Loan

PATCH /loans/:id/manual-confirm-return (No QR required)
  ├─ Warehouse access check (pre-transaction)
  ├─ In transaction:
  │   ├─ Re-validate status is RETURN_PENDING or OVERDUE
  │   ├─ Guard: OVERDUE without receivedAt → error
  │   └─ Update to RETURNED + returnDate + returnConfirmedBy
  └─ Audit: UPDATE Loan (confirmedManually: true)
```

---

## Database Schema Highlights

### Core Entities

- **User** → roles via `RolePermission` join table (granular RBAC)
- **Warehouse** → stores `InventoryItem` (one-to-many)
- **InventoryItem** → linked to `Warehouse`, `Category`, `Supplier`
- **Loan** → multi-item lending with status tracking + overdue detection
- **TransferRequest** → multi-item inter-warehouse transfer with approval workflow
- **AuditLog** → immutable activity trail (action, entity, userId, changes)

### Status Enums

**Loan statuses:** `PENDING`, `SENT`, `RECEIVED`, `RETURN_PENDING`, `RETURNED`, `OVERDUE`, `CANCELLED`

**TransferRequest statuses:** `PENDING`, `APPROVED`, `SENT`, `COMPLETED`, `REJECTED`, `CANCELLED`

---

## Security Architecture

### Authentication

- **JWT tokens:** Access (15m) + Refresh (7d), delivered via HttpOnly cookies
- **CSRF:** Double Submit Cookie pattern via `csrf-csrf` package
- **Password:** bcryptjs with salt rounds = 10
- **Strong password policy:** Minimum 8 chars, uppercase, lowercase, number, special char

### Authorization

- **Granular RBAC:** 46 permissions (e.g., `loans:create`, `transfers:manage`, `inventory:delete`)
- **PermissionsGuard:** Validates `@Permissions()` decorator on each route
- **Caching:** 60-second in-memory Map-based cache (no external dependency)
- **Warehouse access control:** Users restricted to assigned warehouses; null = system-wide access

### Request Validation

- **DTOs + class-validator:** All inputs validated at system boundary
- **Zod:** Available for complex schema validation (not currently used)
- **Rate limiting:** Per-IP throttling (10req/sec, 100req/min, 1000req/hour)

### Helmet Security Headers

- CSP (content security policy)
- X-Frame-Options: deny
- X-Content-Type-Options: nosniff
- HSTS (strict transport security)

---

## Key Architectural Decisions

### 1. Manual Confirmation Endpoints (No QR)

**Problem:** Not all users have QR scanners; mobile app needs manual workflow.

**Solution:** Parallel endpoints for both QR-based and manual confirmation:
- `POST /loans/confirm-receipt` → QR-based (scanned data)
- `PATCH /loans/:id/manual-confirm-receipt` → Manual (no QR, direct ID)
- `PATCH /loans/:id/manual-confirm-return` → Manual return
- `POST /transfer-requests/confirm-receipt` → QR-based
- Manual confirmation coming for transfers (same pattern)

**Trade-off:** Doubled endpoints, but supports all user workflows.

### 2. Sequential Inventory Updates (Transaction Safety)

**Problem:** Concurrent transfers can produce negative stock under READ COMMITTED isolation.

**Example race condition:**
```
Transaction A: SELECT inventory WHERE id = 1 → qty = 10
Transaction B: SELECT inventory WHERE id = 1 → qty = 10
Transaction A: UPDATE qty -= 8 → qty = 2 ✓
Transaction B: UPDATE qty -= 9 → qty = 1 ✗ (should fail!)
```

**Solution:** Sequential updates inside `applyInventoryTransfer()`:
1. Re-validate quantities inside transaction (catches concurrent decrements)
2. Sequentially decrement source items (prevents parallel race)
3. Sequentially find/create destination items (prevents CREATE duplicates)

**Cost:** Slightly slower for bulk transfers, but guarantees correctness.

### 3. Immutable Audit Trail

**Design:** `AuditLog` table is write-only; no deletes/updates allowed.

**Fields:** `action` (CREATE/UPDATE/DELETE), `entity`, `entityId`, `userId`, `changes` (JSON), `timestamp`

**Use case:** Compliance, forensics, debugging state transitions.

---

## Testing Strategy

| Level | Framework | Coverage | Example |
|-------|-----------|----------|---------|
| **Unit** | Jest | Services, utilities | `loans.service.spec.ts` |
| **Integration** | Jest + Supertest | Controllers, API endpoints | (TODO) |
| **E2E** | Playwright (planned) | Critical flows | Login → Transfer → Report |

**Current Coverage:** ~45% (services tested, controllers partially tested)

**Target:** 80%+ by v0.6.0

---

## Deployment

### Development

```bash
npm install
cp .env.example .env
npm run prisma:generate        # Generate Prisma client (SQLite)
npm run start:dev              # Port 3000
POST /api/seed                 # Bootstrap admin + RBAC
```

### Production (Railway)

```bash
railway build                  # Uses schema.prod.prisma (PostgreSQL)
railway migrate                # Runs db push
railway start                  # Runs dist/main
```

See [Deployment Guide](../DEPLOYMENT-GUIDE.md) for full details.

---

## Performance Notes

### Caching

- **Permissions:** 60-second in-memory Map (invalidated on role change)
- **No redis/memcached:** Acceptable for single-region deployment

### Database

- **Pagination:** Mandatory on list endpoints (default limit = 10)
- **Indexes:** Warehouse filters, status, createdAt (schema includes)
- **N+1 prevention:** Eager loading via `include` in service queries

### Build Optimization

- **SWC transpiler:** ~3x faster than ts-loader
- **Production build:** `npm run build` → 45MB dist
- **Railway build:** Caches node_modules + dist layers

---

## Related Documentation

- [Changelog](../CHANGELOG.md) — Version history
- [Deployment Guide](../DEPLOYMENT-GUIDE.md) — Production setup
- [Railway Deploy](../RAILWAY-DEPLOY.md) — Railway hosting
- [Build Optimization](../BUILD-OPTIMIZATION.md) — Performance tuning

---

## Quick Links

- **API Docs:** `GET http://localhost:3000/api/docs` (Swagger)
- **GitHub:** [Mar10HT/Inv-App-API](https://github.com/Mar10HT/Inv-App-API)
- **Frontend:** [Mar10HT/Inv-App](https://github.com/Mar10HT/Inv-App)

---

**Questions?** Check the specific module codemaps or open an issue on GitHub.
