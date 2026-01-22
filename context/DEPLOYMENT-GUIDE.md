# Deployment Guide - SQLite (Dev) + PostgreSQL (Prod)

## Overview

This project uses:
- **SQLite** for local development (`schema.prisma`)
- **PostgreSQL** for production on Railway (`schema.prod.prisma`)

## 📁 File Structure

```
prisma/
├── schema.prisma           ← SQLite (Development)
├── schema.prod.prisma      ← PostgreSQL (Production)
├── migrations/             ← SQLite migrations
└── migrations-prod/        ← PostgreSQL migrations (future)
```

## 🛠️ Local Development (SQLite)

### Setup
```bash
# Use default schema (SQLite)
npx prisma generate
npx prisma migrate dev
npm run seed
npm run start:dev
```

Your `.env` should have:
```env
DATABASE_URL="file:./prisma/dev.db"
JWT_SECRET="your-dev-secret"
PORT=3000
NODE_ENV=development
```

### Commands
```bash
# Generate Prisma client
npm run prisma:generate

# Create migration
npx prisma migrate dev --name your_migration_name

# Seed database
npm run seed

# View database
npx prisma studio
```

---

## 🚀 Production Deployment (PostgreSQL on Railway)

### Step 1: Push to GitHub

```bash
git add .
git commit -m "feat: add PostgreSQL support for production"
git push origin main
```

### Step 2: Deploy to Railway

1. Go to [railway.app](https://railway.app)
2. Create **New Project**
3. Select **Deploy from GitHub repo**
4. Choose `Inv-App-API` repository
5. Railway auto-detects Node.js

### Step 3: Add PostgreSQL Database

1. In your Railway project, click **"New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway automatically:
   - Creates PostgreSQL database
   - Sets `DATABASE_URL` environment variable

### Step 4: Configure Environment Variables

In Railway dashboard → Your service → **Variables**:

```env
DATABASE_URL=postgresql://...  (auto-set by Railway)
JWT_SECRET=<generate-secure-key>
NODE_ENV=production
PORT=3000
```

**Generate secure JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 5: Configure Build Settings

In Railway dashboard → Your service → **Settings**:

**Build Command:**
```bash
npm run railway:build
```

**Start Command:**
```bash
npm run railway:start
```

This will:
1. Install dependencies
2. Generate Prisma client for PostgreSQL
3. Build NestJS
4. Run PostgreSQL migrations
5. Start server

### Step 6: Seed Production Database

**Option A: Using Railway Shell**
1. Railway dashboard → Your service → Menu (⋯) → **Shell**
2. Run:
```bash
npx prisma db seed --schema=./prisma/schema.prod.prisma
```

**Option B: Custom seed script**

Add to `package.json`:
```json
"scripts": {
  "seed:prod": "ts-node scripts/seed-data.ts"
}
```

In Railway Shell:
```bash
npm run seed:prod
```

---

## 📝 Railway Configuration

### Option 1: Create `railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run railway:build"
  },
  "deploy": {
    "startCommand": "npm run railway:start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Option 2: Create `nixpacks.toml`

```toml
[phases.setup]
nixPkgs = ["nodejs-18_x"]

[phases.install]
cmds = ["npm install"]

[phases.build]
cmds = [
  "npx prisma generate --schema=./prisma/schema.prod.prisma",
  "npm run build"
]

[start]
cmd = "npx prisma migrate deploy --schema=./prisma/schema.prod.prisma && node dist/src/main"
```

---

## 🔄 Workflow

### Local Development
```bash
# Always use default schema (SQLite)
npx prisma migrate dev --name add_new_field
npm run start:dev
```

### Before Deploying
```bash
# Test that PostgreSQL schema is in sync
# (Optional: if you want to test locally with PostgreSQL)

# 1. Temporarily switch DATABASE_URL to PostgreSQL
# DATABASE_URL="postgresql://localhost:5432/test"

# 2. Generate and test
# npx prisma generate --schema=./prisma/schema.prod.prisma
# npx prisma migrate deploy --schema=./prisma/schema.prod.prisma

# 3. Switch back to SQLite
# DATABASE_URL="file:./prisma/dev.db"
```

### Deploy to Production
```bash
git add .
git commit -m "your changes"
git push origin main

# Railway auto-deploys and runs:
# - npm run railway:build
# - npm run railway:start
```

---

## 🔧 Schema Changes

When you modify the schema:

### 1. Update BOTH schema files

**`schema.prisma` (SQLite):**
```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model YourModel {
  // your changes
}
```

**`schema.prod.prisma` (PostgreSQL):**
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model YourModel {
  // SAME changes
}
```

### 2. Create migration for dev

```bash
npx prisma migrate dev --name your_change
```

### 3. Push to production

```bash
git add .
git commit -m "schema: your_change"
git push origin main
```

Railway will auto-run migrations with `schema.prod.prisma`

---

## 🐛 Troubleshooting

### "Schema not found" error
Make sure scripts reference correct schema:
```bash
# Dev (SQLite)
npx prisma generate

# Prod (PostgreSQL)
npx prisma generate --schema=./prisma/schema.prod.prisma
```

### Railway build fails
Check Railway logs:
1. Dashboard → Your service → **Deployments**
2. Click latest deployment
3. View logs

Common issues:
- Missing `schema.prod.prisma`
- Wrong build command
- Missing environment variables

### Database connection error
Verify `DATABASE_URL` in Railway:
- Should start with `postgresql://`
- Auto-set when you add PostgreSQL service
- Check in Variables tab

---

## 📊 Comparison

| Feature | Development | Production |
|---------|------------|------------|
| **Database** | SQLite | PostgreSQL |
| **Schema** | `schema.prisma` | `schema.prod.prisma` |
| **Migrations** | `prisma/migrations/` | Auto-applied |
| **Generate** | `prisma generate` | `prisma generate --schema=./prisma/schema.prod.prisma` |
| **Migrate** | `prisma migrate dev` | `prisma migrate deploy --schema=./prisma/schema.prod.prisma` |

---

## ✅ Checklist Before First Deploy

- [ ] Both `schema.prisma` and `schema.prod.prisma` are identical (except provider)
- [ ] `package.json` has `railway:build` and `railway:start` scripts
- [ ] Pushed to GitHub
- [ ] Created Railway project
- [ ] Added PostgreSQL database in Railway
- [ ] Set environment variables in Railway
- [ ] Configured build/start commands
- [ ] Deploy successful
- [ ] Seeded production database
- [ ] Tested API endpoints

---

## 🎯 Quick Commands Reference

```bash
# DEVELOPMENT (SQLite)
npx prisma generate
npx prisma migrate dev
npm run seed
npm run start:dev
npx prisma studio

# PRODUCTION (PostgreSQL) - Railway auto-runs
npm run railway:build      # Build with PostgreSQL schema
npm run railway:start      # Migrate and start

# MANUAL TESTING (PostgreSQL locally)
npx prisma generate --schema=./prisma/schema.prod.prisma
npx prisma migrate deploy --schema=./prisma/schema.prod.prisma
```

---

**Need help?** Check Railway logs or open an issue!
