# Fase 0 — Setup de desarrollo local

## PostgreSQL 16 local (Windows)

Instalado via `winget install -e --id PostgreSQL.PostgreSQL.16` el 2026-04-20.

### Configuración

| Item | Valor |
|---|---|
| Versión | PostgreSQL 16.13 |
| Host | `localhost` |
| Puerto | `5432` |
| Superuser | `postgres` |
| Password dev | `postgres` |
| DB del proyecto | `obsid_dev` |
| Servicio Windows | `postgresql-x64-16` (auto-start) |
| Binarios | `C:\Program Files\PostgreSQL\16\bin\` |

### Conexión

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/obsid_dev"
```

> Este password es sólo para desarrollo local. En prod (Railway) se usa el `DATABASE_URL` del environment.

### Comandos útiles

```powershell
# Estado del servicio
sc query postgresql-x64-16

# Iniciar / detener el servicio
net start postgresql-x64-16
net stop postgresql-x64-16

# Conectar via psql
$env:PGPASSWORD = "postgres"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -d obsid_dev

# Listar bases de datos
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -l

# Drop + recreate de la DB de dev
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -c "DROP DATABASE IF EXISTS obsid_dev;"
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -h localhost -c "CREATE DATABASE obsid_dev;"
```

## Por qué Postgres nativo (no Docker)

- Docker Desktop falló en la instalación en Windows 11 Pro N.
- Postgres nativo consume menos RAM y arranca con Windows.
- Mismo comportamiento que Railway prod (que también es Postgres 16).

## Unificación SQLite → Postgres

Hoy `prisma/schema.prisma` usa SQLite para dev y `prisma/schema.prod.prisma` usa Postgres. Esta divergencia genera drift (tipos, índices parciales, triggers no portables).

**En Fase 0** se unifica: un único `schema.prisma` apuntando a Postgres, usando `DATABASE_URL` del `.env`. El archivo `schema.prod.prisma` se elimina.

## Configuración en `Inv-App-API/.env`

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/obsid_dev"
MULTI_TENANT_ENABLED=false
TENANT_WAREHOUSE_CACHE_TTL_MS=45000
TENANT_WAREHOUSE_CACHE_MAX=5000
SUPER_ADMIN_IMPERSONATION_MAX_MIN=30
DEFAULT_ORG_SLUG=ON
DEFAULT_ORG_NAME="Olancho Net"
```

## Org inicial

Para el backfill de Fase 1 la única org existente en prod se crea con:

```sql
INSERT INTO organizations (id, slug, name, status, "createdAt", "updatedAt")
VALUES ('org_on', 'ON', 'Olancho Net', 'ACTIVE', NOW(), NOW());
```

Todos los usuarios y datos existentes se mapean a `org_on`.
