# Prisma Configuration Notes

## Files

### `schema.prisma` (Development) and `schema.prod.prisma` (Production)
- Both use **PostgreSQL**. Dev moved off SQLite; `schema.prisma` declares
  `provider = "postgresql"` just like `schema.prod.prisma`.
- The two files are identical except for the `generator` block (prod adds
  `binaryTargets = ["native", "debian-openssl-3.0.x"]` for the Railway
  container). Any field/model change goes into **both** files.
- Connect via `DATABASE_URL` in each environment's `.env`.

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

### Development
```bash
# Generate Prisma Client
npm run prisma:generate

# Apply schema changes to the local database
npx prisma db push --schema=./prisma/schema.prisma

# Open Prisma Studio
npm run prisma:studio
```

Use `prisma db push`, not `prisma migrate dev`: this project does not keep
a live formal migration history (the dated folders under
`prisma/migrations/` are leftover from early development and are not part
of the current workflow). A schema change that needs to transform or
backfill existing data gets its own one-off SQL script (see "Migration
Workflow" below), not a Prisma migration file.

### Production (Railway)
```bash
# Runs automatically on deploy via railway:start; can also be run manually
npm run railway:migrate
```

`railway:migrate` is a single chained command in `package.json`:

```
migrate-loan-multi-item.sql && migrate-document-numbers.sql
  && migrate-decimal-amounts.sql && prisma db push --schema=./prisma/schema.prod.prisma
```

**The order matters and is not arbitrary.** Each `.sql` file is idempotent
(safe to run on every deploy) and handles one past schema change that
needed real data migrated, not just a column added. `migrate-decimal-amounts.sql`
has to run *after* `migrate-document-numbers.sql` specifically because the
latter does a `CREATE TABLE IF NOT EXISTS fiscal_config (...)` with
`isvPercent` typed `double precision` — on a database that doesn't have
that table yet, running the Decimal script first would miss a table that
gets created with the wrong type immediately after. New one-off scripts
get added to this chain in the same way, before the final `db push`, and
`db push` runs without `--accept-data-loss`: if a script left the database
out of sync with the schema, `db push` fails loudly instead of silently
dropping data.

## Migration Workflow

### Changing the schema
1. Edit `schema.prisma` **and** `schema.prod.prisma` identically (see note above).
2. `npx prisma validate --schema=./prisma/schema.prisma` and the same for `schema.prod.prisma`.
3. If the change only adds optional columns or ones with a default, `prisma db push` on each environment is enough — no script needed.
4. If existing data needs to be transformed (a type change, a backfill, a rename that isn't a straight column rename), write a new `prisma/migrate-<name>.sql`, following the style of `migrate-decimal-amounts.sql` or `migrate-document-numbers.sql` (idempotent, guarded with `to_regclass`/`information_schema.columns` checks so it's safe to run again). Chain it into `railway:migrate` in `package.json`, in the position its dependencies require (see the ordering note above).
5. Run it locally against `obsid_main_dev` (or a throwaway database) before it ever runs against production, and verify row counts/sums are unchanged by the script.

### Deploying to production
`railway:start` runs `railway:migrate` before starting the server, so a
deploy applies the SQL chain and then `db push` automatically. There is no
separate manual deploy step.

## Database Providers

| Environment | Provider | Schema file |
|------------|----------|-------------|
| Development | PostgreSQL | `schema.prisma` |
| Production | PostgreSQL | `schema.prod.prisma` |
