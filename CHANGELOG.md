# Changelog

All notable changes to Obsid API (backend) will be documented in this file.

This project uses [Semantic Versioning](https://semver.org/). Version `0.x.x` indicates pre-release development.

---

## [Unreleased]

### Fixed
- RBAC seed (`PermissionsSeedService.syncRolePermissions`) no longer passes `skipDuplicates` to `rolePermission.createMany`, which SQLite (the dev datasource) does not support and threw on. This silently prevented newly-added permissions from being granted to roles in dev; `toAdd` is already deduplicated so the flag was unnecessary.

### Added
- **Sales module**: `Sale` / `SaleItem` tables, `SalesModule` (service, controller, DTOs) for recording sales that decrement stock
  - Per-line manual pricing with customer tier (`WHOLESALE` / `DISTRIBUTOR` / `RETAIL`), single-currency totals, snapshots of item name/price
  - New permissions: `sales:view`, `sales:create`, `sales:cancel` (assigned to `WAREHOUSE_MANAGER`, `USER` view+create, `VIEWER` view)
  - Endpoints: `POST /sales`, `GET /sales`, `GET /sales/stats`, `GET /sales/:id`, `GET /sales/:id/pdf`, `PATCH /sales/:id/cancel`
  - PDF sale receipt (`generateSaleReceipt`) with customer block and per-currency totals; cancel restores stock and watermarks the PDF
- Documentation: recorded the previously-undocumented **Outflows** module (write-offs) and corrected RBAC counts to **55 permissions across 18 modules**

## [0.5.0] - 2026-03-28

### Added
- **Granular RBAC system**: `Role`, `Permission`, `RolePermission` tables replace the flat `UserRole` enum for authorization
- `src/common/constants/permissions.constant.ts` — 46 permissions across 14 modules as code source of truth
- `PermissionsService` with 60-second in-memory cache (Map-based, no external dependency)
- `@Permissions()` decorator + `PermissionsGuard` replacing `RolesGuard` across all controllers
- `GET /auth/me` endpoint returning user profile + resolved permissions + `permissionsVersion`
- `POST /seed/permissions` — dedicated idempotent RBAC seed endpoint
- `permissionsVersion` field on `User` for frontend permission-change polling
- `roleId` field on `User` and `UserWarehouse` for future per-warehouse role support
- `PermissionsModule` exporting `PermissionsService`
- New permissions: `alerts:manage`, `transactions:delete`, `loans:delete`
- Admin auth endpoints: `GET /auth/pending-resets`, `POST /auth/admin/generate-reset-link/:userId`

### Changed
- All 14+ controllers migrated from `@Roles()` + `RolesGuard` to `@Permissions()` + `PermissionsGuard`
- Login and refresh token responses now include `permissionsVersion`
- `POST /seed` also runs RBAC seed (idempotent, safe to re-run)
- `WAREHOUSE_MANAGER` role gains `alerts:manage` permission

### Deprecated
- `RolesGuard` — marked `@deprecated`, retained for backwards compatibility until Phase 7 cleanup
- `@Roles()` decorator — marked `@deprecated`, use `@Permissions()` instead

---

## [0.4.5] - 2026-01-19

### Security
- CSRF protection with Double Submit Cookie pattern
- JWT tokens delivered via HttpOnly cookies
- Tiered rate limiting (per-second, per-minute, per-hour)
- Helmet security headers

### Added
- Warehouse-to-warehouse loan endpoints with multi-item support
- Automatic overdue detection for loans
- Loan statistics and filtered listing

### Fixed
- Transaction creation now uses proper database transactions for inventory updates

---

## [0.4.0] - 2026-01-14

### Added
- Transfer request module with approval workflow
- Stock take and reconciliation endpoints
- Stock alert system with cron-based scheduling
- Audit logging for all entity operations
- Excel and PDF report generation

---

## [0.3.0] - 2026-01-12

### Added
- Transactions module (entry, exit, transfer)
- User management with role-based access control
- Health check endpoint
- Winston structured logging

---

## [0.2.0] - 2026-01-09

### Added
- Warehouses CRUD module
- Suppliers CRUD module
- Categories CRUD module

---

## [0.1.0] - 2025-11-22

### Added
- Initial API with NestJS and Prisma
- Inventory CRUD with pagination and filtering
- JWT authentication with Passport
- Database seeding
- Swagger/OpenAPI documentation
