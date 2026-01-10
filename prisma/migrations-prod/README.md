# PostgreSQL Migrations

This folder contains migrations specifically for PostgreSQL (production).

## Creating a new migration for PostgreSQL

```bash
npx prisma migrate dev --schema=./prisma/schema.prod.prisma --name your_migration_name
```

## Deploying migrations to production (Railway)

Railway will automatically run:
```bash
npx prisma migrate deploy --schema=./prisma/schema.prod.prisma
```

This happens in the `railway:migrate` script.
