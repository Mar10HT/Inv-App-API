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
- **Loan Management** — Due dates, automatic overdue detection, multi-item support
- **Reports** — Excel and PDF export, inventory value and status analytics
- **Audit Trail** — Full activity logging with user, action, and change tracking
- **Stock Alerts** — Scheduled cron jobs for low stock and overdue loan notifications
- **Security** — Rate limiting, input validation, Helmet headers, RBAC with 5 roles

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
npx prisma migrate dev         # Run migrations
npm run seed                   # Seed sample data (optional)
npm run start:dev              # → http://localhost:3000
```

Swagger documentation is available at [`/api/docs`](http://localhost:3000/api/docs).

## API Overview

| Module | Endpoints | Description |
|--------|:---------:|-------------|
| Auth | 6 | Login, register, logout, profile, password |
| Inventory | 12 | CRUD, bulk operations, stats |
| Warehouses | 5 | CRUD |
| Suppliers | 5 | CRUD |
| Categories | 5 | CRUD |
| Transactions | 6 | Stock movements |
| Loans | 11 | Lending workflow |
| Alerts | 9 | Stock alerts |
| Reports | 5 | Excel/PDF export |
| Transfers | 9 | Approval workflow |
| Stock Take | 8 | Reconciliation |
| Audit | 3 | Activity logs |
| Health | 1 | Health check |

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

| | |
|---|---|
| [Changelog](./CHANGELOG.md) | Version history |
| [Deployment Guide](./context/DEPLOYMENT-GUIDE.md) | Production setup |
| [Railway Deploy](./context/RAILWAY-DEPLOY.md) | Railway hosting |
| [Production Checklist](./context/PRODUCTION-CHECKLIST.md) | Pre-launch checklist |
| [Build Optimization](./context/BUILD-OPTIMIZATION.md) | Build performance |
| [Optimizations](./context/OPTIMIZATIONS.md) | Full-stack analysis |

## License

[MIT](./LICENSE) — Mario Herrera
