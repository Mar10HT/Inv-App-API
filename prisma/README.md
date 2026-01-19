# Prisma Configuration Notes

## Files

### `schema.prisma` (Development)
- Uses SQLite for local development
- File-based database: `dev.db`
- Fast setup, no external dependencies

### `schema.prod.prisma` (Production)
- Uses PostgreSQL for Railway deployment
- Connects via `DATABASE_URL` environment variable
- Production-grade relational database

## Why is `prisma.config.ts` disabled?

The file `prisma.config.ts.disabled` exists but is not used because:

1. **Railway Cache Issue**: Railway uses cache mounts during build that hide `node_modules`, making `dotenv/config` unavailable
2. **Not Needed**: We explicitly specify the schema file in commands:
   ```bash
   # Development
   npx prisma generate --schema=./prisma/schema.prisma

   # Production
   npx prisma generate --schema=./prisma/schema.prod.prisma
   ```
3. **Environment Loading**: Prisma automatically loads `.env` files without needing a config file

## Commands

### Development (SQLite)
```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Open Prisma Studio
npm run prisma:studio

# Reset database
npx prisma migrate reset --schema=./prisma/schema.prisma
```

### Production (PostgreSQL)
```bash
# Generate Prisma Client
npm run prisma:generate:prod

# Apply migrations (Railway does this automatically)
npm run railway:migrate

# Or manually
npx prisma migrate deploy --schema=./prisma/schema.prod.prisma
```

## Migration Workflow

### Creating a New Migration
Always create migrations using the development schema:

```bash
# 1. Make changes to schema.prisma
# 2. Create migration
npx prisma migrate dev --name your_migration_name --schema=./prisma/schema.prisma

# 3. Copy changes to schema.prod.prisma
# 4. Commit both schemas + migration files
```

### Deploying to Production
Migrations are applied automatically on Railway deploy via the start script:
```bash
prisma migrate deploy --schema=./prisma/schema.prod.prisma && node dist/src/main
```

## Database Providers

| Environment | Provider | File |
|------------|----------|------|
| Development | SQLite | `dev.db` |
| Production | PostgreSQL | Railway DB |

Both schemas share the same migration history in `prisma/migrations/`.
