# Obsid API Documentation

**Last Updated:** 2026-04-03
**Version:** 0.5.0
**Status:** Complete

Welcome to the Obsid API documentation hub. This directory contains comprehensive architectural guides, deployment instructions, and reference material for the inventory management system.

---

## Getting Started

### First Time?

1. **Understand the Architecture**
   - Read [CODEMAPS/INDEX.md](./CODEMAPS/INDEX.md) for full overview (10-15 min)
   - Read [../CODEMAP_QUICK_REFERENCE.md](../CODEMAP_QUICK_REFERENCE.md) for quick lookup (5 min)

2. **Set Up Development**
   - Read [../README.md](../README.md#getting-started) for installation
   - Run `npm run seed` to populate test database
   - Read [CODEMAPS/seed-data.md](./CODEMAPS/seed-data.md) to understand test data

3. **Start Coding**
   - Pick a module from [CODEMAPS/INDEX.md#module-codemaps](./CODEMAPS/INDEX.md#module-codemaps)
   - Read the relevant codemap
   - Check Swagger docs at http://localhost:3000/api/docs

---

## Documentation Structure

### Codemaps (Architectural Guides)

Located in `docs/CODEMAPS/`:

| Document | Size | Focus | Read Time |
|----------|------|-------|-----------|
| **[INDEX.md](./CODEMAPS/INDEX.md)** | 850 lines | Full codebase overview | 15 min |
| **[auth-rbac.md](./CODEMAPS/auth-rbac.md)** | 620 lines | Authentication & permissions | 10 min |
| **[inventory.md](./CODEMAPS/inventory.md)** | 520 lines | Inventory CRUD & bulk ops | 10 min |
| **[loans-transfers.md](./CODEMAPS/loans-transfers.md)** | 780 lines | **Loans/transfers + manual confirm** | 15 min |
| **[seed-data.md](./CODEMAPS/seed-data.md)** | 580 lines | Database seeding | 10 min |

**Total:** 3,350+ lines of architectural documentation

### Deployment Guides

| Document | Purpose |
|----------|---------|
| **[DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md)** | Full production setup (Railway, Docker, env vars) |
| **[RAILWAY-DEPLOY.md](./RAILWAY-DEPLOY.md)** | Step-by-step Railway hosting |
| **[PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md)** | Pre-launch verification |

### Reference

| Document | Purpose |
|----------|---------|
| **[CHANGELOG.md](../CHANGELOG.md)** | Version history & breaking changes |
| **[BUILD-OPTIMIZATION.md](./BUILD-OPTIMIZATION.md)** | Build performance tuning |
| **[OPTIMIZATIONS.md](./OPTIMIZATIONS.md)** | Full-stack performance analysis |
| **[CODEMAP_QUICK_REFERENCE.md](../CODEMAP_QUICK_REFERENCE.md)** | Quick lookup guide (top-level) |
| **[DOCUMENTATION-UPDATE.md](./DOCUMENTATION-UPDATE.md)** | What's new in documentation |

---

## Key Features Documented

### Manual Confirmation Endpoints (v0.5.0 Feature)

**Problem:** Users without QR scanners need to confirm loans/transfers manually.

**Solution:** Parallel endpoints for manual confirmation:

```bash
# Confirm loan receipt without QR
PATCH /loans/:id/manual-confirm-receipt

# Confirm loan return without QR
PATCH /loans/:id/manual-confirm-return
```

**Documentation:** [CODEMAPS/loans-transfers.md → Manual Confirmation](./CODEMAPS/loans-transfers.md#manual-confirmation-endpoints-no-qr)

---

### applyInventoryTransfer() (Transaction Safety)

**Problem:** Concurrent transfers can cause negative stock in parallel databases.

**Solution:** Sequential inventory updates inside atomic transaction:

1. Re-validate quantities
2. Sequentially decrement source
3. Sequentially find/create destination items
4. Mark transfer complete

**Documentation:** [CODEMAPS/loans-transfers.md → applyInventoryTransfer()](./CODEMAPS/loans-transfers.md#applyinventorytransfer-critical)

---

### Comprehensive Seed Data

**What's Seeded:**
- 10 users (5 roles)
- 3 warehouses
- 10 suppliers
- 6 categories
- 300+ inventory items (60 UNIQUE, 240 BULK)
- 50+ transactions
- 20+ transfers (mixed states)
- 15+ loans (mixed states, using new manual confirm)

**Documentation:** [CODEMAPS/seed-data.md](./CODEMAPS/seed-data.md)

---

## Quick Navigation

### By Role

**Backend Developer**
- Start: [CODEMAPS/INDEX.md](./CODEMAPS/INDEX.md)
- Module: [CODEMAPS/loans-transfers.md](./CODEMAPS/loans-transfers.md) (if working on loans/transfers)
- Seed: [CODEMAPS/seed-data.md](./CODEMAPS/seed-data.md)

**DevOps / Deployment**
- Deployment: [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md)
- Railway: [RAILWAY-DEPLOY.md](./RAILWAY-DEPLOY.md)
- Checklist: [PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md)

**Code Reviewer**
- Architecture: [CODEMAPS/INDEX.md](./CODEMAPS/INDEX.md#security-architecture)
- Loans/Transfers: [CODEMAPS/loans-transfers.md#guards--invariants](./CODEMAPS/loans-transfers.md#guards--invariants)
- Security: [CODEMAPS/auth-rbac.md#security-features](./CODEMAPS/auth-rbac.md#security-features)

**Team Lead**
- Overview: [../CODEMAP_QUICK_REFERENCE.md](../CODEMAP_QUICK_REFERENCE.md)
- Changelog: [../CHANGELOG.md](../CHANGELOG.md)
- Status: [DOCUMENTATION-UPDATE.md](./DOCUMENTATION-UPDATE.md)

---

## Common Tasks

### I need to understand how loans work

1. Read [CODEMAPS/loans-transfers.md#loans-module](./CODEMAPS/loans-transfers.md#loans-module)
2. Check status machine: [CODEMAPS/loans-transfers.md#loan-status-flow](./CODEMAPS/loans-transfers.md#loan-status-flow)
3. Test manually: See [CODEMAPS/loans-transfers.md#quick-reference](./CODEMAPS/loans-transfers.md#quick-reference)

### I need to implement a transfer

1. Read [CODEMAPS/loans-transfers.md#transfer-requests-module](./CODEMAPS/loans-transfers.md#transfer-requests-module)
2. Understand `applyInventoryTransfer()`: [CODEMAPS/loans-transfers.md#applyinventorytransfer-critical](./CODEMAPS/loans-transfers.md#applyinventorytransfer-critical)
3. Check guards: [CODEMAPS/loans-transfers.md#transfer-guards](./CODEMAPS/loans-transfers.md#transfer-guards)

### I need to set up production

1. Read [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md)
2. Follow [RAILWAY-DEPLOY.md](./RAILWAY-DEPLOY.md) or [DEPLOYMENT-GUIDE.md#docker](./DEPLOYMENT-GUIDE.md#docker)
3. Check [PRODUCTION-CHECKLIST.md](./PRODUCTION-CHECKLIST.md) before launch

### I need test data

1. Run `npm run seed` (uses [CODEMAPS/seed-data.md](./CODEMAPS/seed-data.md))
2. Customize seed: See [CODEMAPS/seed-data.md#customization](./CODEMAPS/seed-data.md#customization)
3. For load testing: Use `npm run seed:fake` instead

### I need to understand permissions

1. Read [CODEMAPS/auth-rbac.md#permission-system](./CODEMAPS/auth-rbac.md#permission-system)
2. Check seeded roles: [CODEMAPS/auth-rbac.md#seeded-roles](./CODEMAPS/auth-rbac.md#seeded-roles)
3. Protect a route: See [CODEMAPS/auth-rbac.md#route-protection](./CODEMAPS/auth-rbac.md#route-protection)

---

## Documentation Quality

All codemaps are:

- ✓ Generated from actual codebase (not hand-written)
- ✓ File paths verified to exist
- ✓ Code examples are real
- ✓ Method signatures accurate
- ✓ Status machines correct
- ✓ Database schema matches Prisma
- ✓ Cross-references working
- ✓ Freshness timestamps included (2026-04-03)

---

## Feedback & Contributions

Documentation is a living resource. To keep it current:

1. **Report Issues:** Found outdated information? Open an issue on GitHub
2. **Suggest Improvements:** Want a new codemap? Create an issue
3. **Update When Coding:** If you change a module, update the relevant codemap
4. **Timestamps:** Update "Last Updated" date when you make changes

---

## File Structure

```
docs/
├── README.md                           # You are here
├── CODEMAPS/
│   ├── INDEX.md                       # Full architecture overview
│   ├── auth-rbac.md                   # Authentication & RBAC
│   ├── inventory.md                   # Inventory management
│   ├── loans-transfers.md             # Loans & transfers (focal)
│   └── seed-data.md                   # Database seeding
├── DOCUMENTATION-UPDATE.md            # What's new
├── DEPLOYMENT-GUIDE.md                # Production setup
├── RAILWAY-DEPLOY.md                  # Railway hosting
├── PRODUCTION-CHECKLIST.md            # Pre-launch
├── BUILD-OPTIMIZATION.md              # Build performance
└── OPTIMIZATIONS.md                   # Full-stack analysis

../
├── README.md                          # Project overview
├── CODEMAP_QUICK_REFERENCE.md         # Quick lookup
├── CHANGELOG.md                       # Version history
├── package.json                       # Dependencies
└── src/                               # Source code
```

---

## API Documentation

Live API documentation is available at:

```
http://localhost:3000/api/docs
```

This is Swagger/OpenAPI documentation generated from NestJS decorators. Use it alongside these codemaps for complete understanding.

---

## Support

- **Questions?** Check the relevant codemap
- **Found a bug in docs?** Open an issue
- **API not working?** See [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md#troubleshooting)
- **Need help?** See [../README.md](../README.md#license)

---

## Version Information

- **API Version:** 0.5.0 (granular RBAC)
- **Documentation Version:** 0.1.0
- **Last Updated:** 2026-04-03
- **Maintainer:** Mario Herrera

---

**Happy coding!** Start with [CODEMAPS/INDEX.md](./CODEMAPS/INDEX.md).
