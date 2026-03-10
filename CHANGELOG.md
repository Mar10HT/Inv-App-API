# Changelog

All notable changes to Obsid API (backend) will be documented in this file.

This project uses [Semantic Versioning](https://semver.org/). Version `0.x.x` indicates pre-release development.

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
