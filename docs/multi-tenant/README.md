# Multi-Tenant Migration — Obsid

Documentación de la migración de single-tenant a multi-tenant para `Inv-App-API`, `Inv-App` y `obsid-mobile`.

## Estado

- **Rama activa**: `multi-tenant`
- **Feature flag**: `MULTI_TENANT_ENABLED=false` (se enciende en Fase 2)
- **Org inicial**: `slug=ON`, `name=Olancho Net`

## Estrategia

- Shared DB + shared schema + discriminador `organizationId`.
- Dos capas de filtrado: **Org** (automática via Prisma extension + ALS) + **Warehouse** (explícita en services, sólo para datos warehouse-bound).
- Tabla pivote `UserOrganization` (email puede pertenecer a varias orgs).
- `SUPER_ADMIN` vive fuera de `UserOrganization`.
- `ORG_ADMIN`/`OWNER` bypassan filtro warehouse dentro de su org.
- Storage de uploads: `/org/{orgId}/...`.
- `RefreshToken` atado a `(userId, organizationId)`.

## Decisiones arquitectónicas resueltas

| # | Decisión | Veredicto |
|---|---|---|
| D1 | `warehouseIds[]` en JWT | **Fuera**. Recalcular por request con LRU cache (TTL 45s). ORG_ADMIN/OWNER bypassan cache. |
| D2 | `organizationId` denormalizado en child tables | **Sí** en los 4 children + `UserWarehouse`. Trigger Postgres valida consistencia con parent. |
| D3 | ALS wrapper | **`nestjs-cls`** (adaptadores listos para HTTP + schedule + testing). |
| D4 | Header `X-Org-Id` | **Sólo para `SUPER_ADMIN`** (impersonation + audit log). Usuarios normales: orgId en JWT. Cambio de org = `POST /auth/switch-org`. |

## JWT payload

```ts
interface JwtPayload {
  sub: string;       // userId
  email: string;
  orgId?: string;    // presente para usuarios normales
  orgRole?: 'OWNER' | 'ORG_ADMIN' | 'MEMBER' | 'EXTERNAL';
  role?: 'SUPER_ADMIN'; // sólo presente en super-admins
}
```

## Modelos con `organizationId` (17 tablas)

**Base (13):**
Warehouse, InventoryItem, Supplier, Category, Transaction, Loan, StockAlert, TransferRequest, StockTake, DischargeRequest, AuditLog, ScheduledReport, UserWarehouse.

**Children denormalizados (4):**
TransactionItem, TransferRequestItem, StockTakeItem, DischargeRequestItem.

**`RefreshToken`** también recibe `organizationId`.

## Modelos NO scopeados (globales)

User, Role, Permission, RolePermission, LoginAttempt, PasswordResetToken, Organization, UserOrganization.

## Plan por fases

| Fase | Duración | Entregable |
|---|---|---|
| 0 — Fundaciones | 3d | `nestjs-cls` + flag + esqueletos `TenantModule`/`OrganizationsModule` + `SUPER_ADMIN` enum |
| 1 — Schema + backfill | 5d | 17 tablas con `organizationId`, triggers, default-org `ON` seedeada |
| 2 — Activación filtrado | 6d | Extension Prisma + Interceptor + JWT nuevo + `switch-org` + cron multi-tenant |
| 3 — Services/controllers | 6d | Refactor de 27 services + 19 controllers |
| 3.5 — SSO B2B | 3-5d | Google Workspace + Microsoft Entra + domain verification + JIT con pending approval |
| 4 — Frontend Inv-App | 3d | Store org + switcher + select-org screen |
| 5 — Mobile obsid | 2d | Pantalla select-org + Zustand + header |
| 6 — Hardening | 3d | Uploads por org, audit, índices, suite de aislamiento |
| 7 — Release | 2d | Flag ON, invalidar refresh tokens, rollout |

**Total: ~33-35 días laborales (~7 semanas).**

Ver [`phase-0-setup.md`](./phase-0-setup.md) para setup de dev, y [`phase-3-5-sso.md`](./phase-3-5-sso.md) para el plan de SSO B2B.
