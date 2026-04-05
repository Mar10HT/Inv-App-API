<div align="center">

<h1>Obsid API</h1>

**RESTful backend for inventory management.**

[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://prisma.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](./LICENSE)

[API Docs](http://localhost:3000/api/docs) · [Deployment](./context/DEPLOYMENT-GUIDE.md) · [Changelog](./CHANGELOG.md) · [Frontend](https://github.com/mherrerabl/Inv-App)

</div>

---

Handles authentication, stock operations, multi-warehouse logistics, and reporting with role-based access control. Built with NestJS, Prisma, and PostgreSQL.

## Features

- **Authentication** — JWT with HttpOnly cookies, CSRF protection, strong password policy
- **Inventory CRUD** — Paginated responses, advanced filtering, bulk operations, soft deletes
- **Warehouse Logistics** — Transfer requests with approval flow, stock reconciliation, inventory counts
- **Loan Management** — Due dates, automatic overdue detection, multi-item support, **manual confirmation endpoints** (no QR required)
- **Transfer Confirmations** — QR-based and **manual confirmation workflows**, atomically-safe inventory application with sequential updates
- **Reports** — Excel and PDF export, inventory value and status analytics
- **Audit Trail** — Full activity logging with user, action, and change tracking
- **Stock Alerts** — Scheduled cron jobs for low stock and overdue loan notifications
- **Permissions** — Granular RBAC: 46 permissions across 14 modules, 5 seeded roles, in-memory cache (60s TTL)
- **Security** — Rate limiting, input validation, Helmet headers, CSRF protection, warehouse-level access control
- **Transaction Safety** — Race condition prevention with sequential inventory updates and TOCTOU guards

## Tech Stack

| | Technology |
|---|---|
| **Framework** | NestJS 10 |
| **ORM** | Prisma 5 |
| **Database** | SQLite (dev) · PostgreSQL (prod) |
| **Auth** | Passport JWT · bcrypt |
| **Docs** | Swagger / OpenAPI |
| **Logging** | Winston |
| **Testing** | Jest |

## Getting Started

**Prerequisites:** Node.js 20+

```bash
npm install
cp .env.example .env           # Configure environment
npx prisma db push             # Push schema to SQLite (dev)
npm run prisma:generate        # Generate Prisma client
npm run start:dev              # → http://localhost:3000
# POST http://localhost:3000/api/seed  (seed admin + RBAC permissions)
```

> **Note:** In dev (SQLite) use `prisma db push` + `prisma:generate`, not `prisma migrate dev` — SQLite has migration drift.

Swagger documentation is available at [`/api/docs`](http://localhost:3000/api/docs).

## API Overview

<!-- AUTO-GENERATED: counts from controller files -->
| Module | Endpoints | Description |
|--------|:---------:|-------------|
| Auth | 13 | Login, register, logout, refresh, profile, password, `/auth/me` |
| Inventory | 16 | CRUD, bulk import/update/delete, stats, Excel template |
| Warehouses | 5 | CRUD + manager assignment |
| Suppliers | 5 | CRUD |
| Categories | 5 | CRUD |
| Transactions | 5 | Stock movements |
| Loans | 14 | Lending workflow, QR + **manual confirm** (no QR), overdue check |
| Alerts | 10 | Stock alerts, resolve, trigger check |
| Reports | 8 | Excel/PDF export per module |
| Scheduled Reports | 5 | Cron-based report scheduling |
| Transfers | 13 | Approval workflow, QR + **manual confirm**, atomically-safe inventory sync |
| Discharge Requests | 8 | Public form + admin review |
| Stock Take | 7 | Reconciliation, variance report |
| Audit | 3 | Activity logs |
| Seed | 2 | Admin + RBAC seed |
| Health | 1 | Health check |
<!-- END AUTO-GENERATED -->

<details>
<summary><b>Example requests</b></summary>

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "YourPassword123!"}'

# List inventory (paginated)
curl http://localhost:3000/api/inventory?page=1&limit=10 \
  -H "Authorization: Bearer <token>"

# Export to Excel
curl http://localhost:3000/api/reports/inventory/excel \
  -H "Authorization: Bearer <token>" -o inventory.xlsx
```

</details>

## Testing

```bash
npm test              # Run all tests
npm run test:cov      # Coverage report
npm run test:e2e      # E2E tests
```

## Deploy

<details>
<summary><b>Railway</b></summary>

```bash
npm i -g @railway/cli
railway login && railway link && railway up
```

See [Railway Deploy](./context/RAILWAY-DEPLOY.md) for detailed setup.

</details>

<details>
<summary><b>Docker</b></summary>

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY prisma ./prisma
RUN npx prisma generate
EXPOSE 3000
CMD ["node", "dist/main"]
```

</details>

See [Deployment Guide](./context/DEPLOYMENT-GUIDE.md) and [Production Checklist](./context/PRODUCTION-CHECKLIST.md) for full instructions.

## Documentation

### Architecture & Design (Codemaps)

| Codemap | Coverage | Purpose |
|---------|----------|---------|
| **[Index](./docs/CODEMAPS/INDEX.md)** | Full codebase | Overview, architecture diagram, data flows |
| **[Auth & RBAC](./docs/CODEMAPS/auth-rbac.md)** | `src/auth/`, `src/permissions/` | JWT, 46 granular permissions, caching, warehouse access control |
| **[Inventory](./docs/CODEMAPS/inventory.md)** | `src/inventory/` | CRUD, bulk operations, soft deletes, filtering, Excel import/export |
| **[Loans & Transfers](./docs/CODEMAPS/loans-transfers.md)** | `src/loans/`, `src/transfer-requests/` | **Manual confirmation endpoints**, QR workflows, transaction safety, sequential updates |
| **[Seed Data](./docs/CODEMAPS/seed-data.md)** | `scripts/seed-data.ts` | Dev database seeding, 300+ realistic items, transfers, loans |

### Guides & References

| Document | Topic |
|----------|-------|
| [Changelog](./CHANGELOG.md) | Version history |
| [Deployment Guide](./context/DEPLOYMENT-GUIDE.md) | Production setup |
| [Railway Deploy](./context/RAILWAY-DEPLOY.md) | Railway hosting |
| [Production Checklist](./context/PRODUCTION-CHECKLIST.md) | Pre-launch checklist |
| [Build Optimization](./context/BUILD-OPTIMIZATION.md) | Build performance |
| [Optimizations](./context/OPTIMIZATIONS.md) | Full-stack analysis |

## License

[MIT](./LICENSE) — Mario Herrera
