<div align="center">

# 🔧 Inv-App API

### RESTful Backend for Inventory Management

[![NestJS](https://img.shields.io/badge/NestJS-10.0-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)](https://nestjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-5.0-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://prisma.io)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Jest](https://img.shields.io/badge/Jest-141_tests-C21325?style=for-the-badge&logo=jest&logoColor=white)](https://jestjs.io)

<br/>

[Features](#-features) •
[Quick Start](#-quick-start) •
[API Docs](#-api-documentation) •
[Testing](#-testing)

</div>

---

## ✨ Features

<table>
<tr>
<td>

### 🔐 Security
- JWT + HttpOnly cookies
- Role-based access (RBAC)
- Rate limiting (tiered)
- Password hashing (bcrypt)
- CSRF protection

</td>
<td>

### 📊 Core Features
- Full CRUD for all entities
- Paginated responses
- Advanced filtering
- Soft deletes
- Audit logging

</td>
</tr>
<tr>
<td>

### 📦 Advanced
- Bulk operations
- Excel/PDF export
- Stock alerts (cron)
- Transfer workflows
- Stock reconciliation

</td>
<td>

### 🛠 Infrastructure
- Winston logging
- Swagger docs
- Health checks
- Input validation
- Error handling

</td>
</tr>
</table>

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Run migrations
npx prisma migrate dev

# Seed database (optional)
npm run seed

# Start development
npm run start:dev
# → http://localhost:3000
# → Swagger: http://localhost:3000/api/docs
```

### Environment Variables

```env
# Database
DATABASE_URL="file:./dev.db"           # SQLite (dev)
# DATABASE_URL="postgresql://..."       # PostgreSQL (prod)

# Security
JWT_SECRET="your-super-secret-key"
JWT_EXPIRATION="7d"

# Server
PORT=3000
NODE_ENV=development
```

---

## 📁 Project Structure

```
src/
├── 📂 auth/                 # Authentication
│   ├── guards/              # JWT & Role guards
│   ├── decorators/          # @Roles, @CurrentUser
│   ├── dto/                 # Login, Register DTOs
│   └── strategies/          # Passport JWT strategy
│
├── 📂 inventory/            # Core inventory module
│   ├── dto/                 # Create, Update, Filter, Bulk DTOs
│   └── inventory.service.ts # Business logic
│
├── 📂 warehouses/           # Warehouse CRUD
├── 📂 suppliers/            # Supplier CRUD
├── 📂 categories/           # Category CRUD
├── 📂 transactions/         # Stock movements
├── 📂 loans/                # Item lending
├── 📂 users/                # User management
│
├── 📂 alerts/               # Stock alerts + cron jobs
├── 📂 reports/              # Excel/PDF generation
├── 📂 transfer-requests/    # Approval workflow
├── 📂 stock-take/           # Inventory reconciliation
├── 📂 audit/                # Activity logging
│
├── 📂 health/               # Health check endpoint
├── 📂 seed/                 # Database seeding
├── 📂 prisma/               # Database service
├── 📂 logger/               # Winston configuration
└── 📂 common/               # Shared DTOs, filters

prisma/
├── schema.prisma            # Database schema
└── migrations/              # Migration history
```

---

## 📡 API Documentation

### Swagger UI

Access interactive documentation at: **http://localhost:3000/api/docs**

### Endpoint Overview

| Module | Endpoints | Description |
|--------|-----------|-------------|
| Auth | 6 | Login, register, logout, profile, password |
| Inventory | 12 | CRUD + bulk + stats |
| Warehouses | 5 | CRUD operations |
| Suppliers | 5 | CRUD operations |
| Categories | 5 | CRUD operations |
| Transactions | 6 | Stock movements |
| Loans | 11 | Item lending |
| Alerts | 9 | Stock alerts |
| Reports | 5 | Excel/PDF export |
| Transfer Requests | 9 | Approval workflow |
| Stock Take | 8 | Reconciliation |
| Audit | 3 | Activity logs |
| Health | 1 | Health check |

### Example Requests

<details>
<summary><b>Authentication</b></summary>

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@inventory.com", "password": "Admin123!"}'

# Response
{
  "access_token": "eyJhbG...",
  "user": {
    "id": "...",
    "email": "admin@inventory.com",
    "role": "SYSTEM_ADMIN"
  }
}
```

</details>

<details>
<summary><b>Inventory CRUD</b></summary>

```bash
# List items (paginated)
curl http://localhost:3000/api/inventory?page=1&limit=10 \
  -H "Authorization: Bearer <token>"

# Create item
curl -X POST http://localhost:3000/api/inventory \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dell Latitude 5430",
    "category": "Laptops",
    "quantity": 10,
    "warehouseId": "..."
  }'

# Bulk import
curl -X POST http://localhost:3000/api/inventory/bulk-import/excel \
  -H "Authorization: Bearer <token>" \
  -F "file=@inventory.xlsx"
```

</details>

<details>
<summary><b>Reports</b></summary>

```bash
# Export to Excel
curl http://localhost:3000/api/reports/inventory/excel \
  -H "Authorization: Bearer <token>" \
  -o inventory.xlsx

# Export to PDF
curl http://localhost:3000/api/reports/inventory/pdf \
  -H "Authorization: Bearer <token>" \
  -o inventory.pdf
```

</details>

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov

# E2E tests
npm run test:e2e
```

### Test Summary

| Suite | Tests | Coverage |
|-------|-------|----------|
| Auth | 22 | Services & Guards |
| Inventory | 28 | CRUD + Bulk |
| Warehouses | 14 | CRUD |
| Suppliers | 14 | CRUD |
| Categories | 14 | CRUD |
| Transactions | 14 | Stock movements |
| Loans | 21 | Lending workflow |
| Users | 14 | User management |
| **Total** | **141** | **~32%** |

---

## 🔐 Security

### Rate Limiting

```typescript
// Tiered rate limiting
ThrottlerModule.forRoot([
  { name: 'short', ttl: 1000, limit: 10 },    // 10/sec
  { name: 'medium', ttl: 60000, limit: 100 }, // 100/min
  { name: 'long', ttl: 3600000, limit: 1000 } // 1000/hr
])
```

### Role-Based Access

```typescript
// Decorator usage
@Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
@UseGuards(JwtAuthGuard, RolesGuard)
async create(@Body() dto: CreateItemDto) { ... }

// Available roles
enum Role {
  SYSTEM_ADMIN,      // Full access
  WAREHOUSE_MANAGER, // Manage assigned warehouse
  USER,              // Basic operations
  VIEWER             // Read-only
}
```

### Password Policy

- Minimum 12 characters
- At least 1 uppercase, 1 lowercase
- At least 1 number, 1 special character
- bcrypt hashing with salt rounds

---

## 📦 Database

### Schema Overview

```prisma
model User {
  id       String @id @default(cuid())
  email    String @unique
  password String
  role     Role   @default(USER)
  // ... relations
}

model InventoryItem {
  id          String @id @default(cuid())
  name        String
  quantity    Int
  status      InventoryStatus
  itemType    ItemType
  warehouseId String
  // ... relations, soft delete
}

// Additional models:
// Warehouse, Supplier, Category, Transaction,
// Loan, AuditLog, StockAlert, TransferRequest, StockTake
```

### Migrations

```bash
# Create migration
npx prisma migrate dev --name add_feature

# Apply migrations
npx prisma migrate deploy

# Reset database
npx prisma migrate reset
```

---

## 🚢 Deployment

### Railway

```bash
# Install CLI
npm i -g @railway/cli

# Login and deploy
railway login
railway link
railway up
```

See [RAILWAY-DEPLOY.md](../context/RAILWAY-DEPLOY.md) for details.

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY prisma ./prisma
RUN npx prisma generate
EXPOSE 3000
CMD ["node", "dist/main"]
```

---

## 📚 Related Documentation

| Document | Description |
|----------|-------------|
| [Deployment Guide](../context/DEPLOYMENT-GUIDE.md) | Production setup |
| [Railway Deploy](../context/RAILWAY-DEPLOY.md) | Railway hosting |
| [Build Optimization](../context/BUILD-OPTIMIZATION.md) | Performance |
| [Production Checklist](../context/PRODUCTION-CHECKLIST.md) | Pre-launch |

---

<div align="center">

**Part of the Inventory Management System**

[← Back to Main README](../README.md)

</div>
