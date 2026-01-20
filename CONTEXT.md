# Project Context - INV-APP API

> **Read this file at the start of each terminal session**

---

## Architecture

| Component | Technology | Environment |
|-----------|------------|-------------|
| **Frontend** | Angular 19 | Vercel |
| **Backend** | NestJS + Prisma | Railway |
| **DB Dev** | SQLite | Local (`prisma/dev.db`) |
| **DB Prod** | PostgreSQL | Railway |

---

## Prisma Schemas

```
prisma/
├── schema.prisma       # SQLite (local development)
├── schema.prod.prisma  # PostgreSQL (production)
└── migrations/         # PostgreSQL only
```

### Important Rule
When you modify the schema, **you MUST update BOTH files**:
1. `schema.prisma` - for local development
2. `schema.prod.prisma` - for production

---

## Migrations

**Development (SQLite):** Does not use migrations, uses `prisma db push`
```bash
npx prisma db push
```

**Production (PostgreSQL):** Uses migrations
```bash
# Create migration manually (you don't have local PostgreSQL)
# 1. Create folder: prisma/migrations/YYYYMMDDHHMMSS_name/
# 2. Create file: migration.sql with the required SQL
```

### Migration Format
```
prisma/migrations/
└── 20260113000000_add_color_to_categories/
    └── migration.sql
```

---

## Useful Commands

### Local Development
```bash
# Sync schema with SQLite
npx prisma db push

# Generate Prisma client
npx prisma generate

# View data
npx prisma studio

# Run seed
npm run seed
```

### For Production (without local PostgreSQL)
```bash
# Generate client for prod
npm run prisma:generate:prod

# Migrations are applied automatically on Railway
# See: railway.json -> startCommand
```

---

## Deploy

### Railway (Backend)
- **Build:** `bun install && prisma generate --schema=./prisma/schema.prod.prisma && npm run build`
- **Start:** `npm run start` (runs migrations and starts)

### Vercel (Frontend)
- Configured in `Inv-App/vercel.json`

---

## Workflow for Database Changes

1. Modify `prisma/schema.prisma` (SQLite)
2. Run `npx prisma db push` to test locally
3. Copy changes to `prisma/schema.prod.prisma`
4. Create manual migration in `prisma/migrations/`
5. Commit and push → Railway applies migrations automatically

---

## Current Pending Tasks

- [ ] Error handling and user feedback
- [ ] Persistence testing
- [ ] Charts with ng-apexcharts
- [ ] Export reports (PDF, Excel)
- [ ] Unit and e2e tests

---

## URLs

| Service | URL |
|---------|-----|
| API Prod | https://[your-app].up.railway.app |
| Frontend Prod | https://[your-app].vercel.app |
| Railway Dashboard | https://railway.app/dashboard |
| Vercel Dashboard | https://vercel.com/dashboard |

---

*Last updated: 2026-01-19*
