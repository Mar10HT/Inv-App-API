# Production Configuration Checklist

Last verified: 2026-07-07, against `main`.

## Build & Deploy (Railway)

- **Toolchain**: bun (not npm). `nixpacks.toml` runs `bun install --frozen-lockfile`,
  generates the Prisma client against `prisma/schema.prod.prisma`, then `bun run build`
  (SWC via `nest build`). `package-lock.json` is gitignored — bun.lock is the only
  lockfile that matters.
- **Start command** (`railway.json` → `bun run railway:start`):
  1. `railway:migrate` — runs the one-off `migrate-loan-multi-item.sql` guard (idempotent,
     no-ops once the old `loans` columns are gone), then `prisma db push --schema=./prisma/schema.prod.prisma --skip-generate`
     (no `--accept-data-loss` — a destructive schema change now fails the deploy loudly
     instead of silently applying).
  2. `start:prod` — `bun dist/main`.
- Prisma migrations under `prisma/migrations/` are NOT what's applied in prod — the
  deploy path uses `db push` against `schema.prod.prisma` directly. The migrations folder
  is stale (predates Sale/Outflow/Role models) and isn't the source of truth for prod schema.
  Moving to `prisma migrate deploy` would require first baselining the prod DB
  (`prisma migrate resolve --applied <name>`) against the already-existing tables — a
  manual, one-time operation against the live database that needs prod credentials.

## Required environment variables

See `.env.example` for the full list with descriptions. The app fails fast at startup
(Joi validation in `app.module.ts`) if any of these are missing/invalid:

- `DATABASE_URL` — Postgres in prod, SQLite (`file:./dev.db`) in dev.
- `JWT_SECRET` — min 32 chars.
- `CSRF_SECRET`
- `FRONTEND_URL` — used in password-reset links, QR codes, email links. Must be the real
  frontend domain in production or those links point at localhost.
- `CORS_ORIGIN` — comma-separated allow-list, e.g. `https://app.example.com,https://admin.example.com`.

Optional: `SENTRY_DSN` (error tracking, currently NOT wired into the code even though
documented — see below), SMTP_* (email; falls back to logging emails if unset).

## Runtime surface

- Global prefix: `/api`. Health check: `GET /api/health` (`@nestjs/terminus`, checks DB
  connectivity). Swagger docs at `/api/docs` (only outside production — check
  `NODE_ENV` guard in `main.ts`).
- Security middleware in `main.ts`: helmet (with CSP), gzip compression, cookie-parser,
  CORS allow-list, CSRF (double-submit cookie, exempts login/refresh/register/forgot-password
  and Bearer-token requests), global `ValidationPipe` (whitelist + forbidNonWhitelisted),
  global exception filter + logging interceptor, tiered rate limiting (`@nestjs/throttler`).
- Logging: Winston, JSON to file in non-prod, colorized console always-on. No external
  error tracker wired in yet (Sentry DSN is documented but unused in code).

## Known gaps (tracked, not blockers)

- Lint is wired up (`bun run lint`) and running in CI, but non-blocking for now — enabling
  it surfaced a pre-existing ~430-finding backlog across the codebase (see `.github/workflows/ci.yml`
  comment). Needs a dedicated cleanup pass before flipping to blocking.
- `MULTI_TENANT_ENABLED` and related env vars in the real `.env` aren't in `.env.example`
  and aren't validated — they look like leftovers from a planned multi-org effort that was
  never built (current tenant isolation is per-warehouse access control, not multi-org).
