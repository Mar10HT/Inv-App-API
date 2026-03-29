# Plan: Refactor de Roles y Permisos (RBAC)

## Contexto

El sistema actual almacena el rol directamente en el modelo `User` como un enum de Prisma (`UserRole`). No existe tabla de permisos — la autorización se basa en comparación de strings en `RolesGuard`. Este plan extrae roles y permisos a tablas configurables en la DB, con un sistema de guards basado en permisos granulares.

---

## Decisiones de diseño

| Tema | Decisión |
|------|----------|
| Roles | Tabla separada `Role`, configurables desde UI por SYSTEM_ADMIN |
| Permisos | Tabla separada `Permission`, fijos en código (seeded), naming `módulo:acción` |
| Multi-rol | No por ahora; anticipado con `roleId` en `UserWarehouse` |
| Permisos por almacén | Globales para todos los almacenes asignados al usuario |
| SYSTEM_ADMIN | Bypass implícito de todos los checks + audit log obligatorio |
| Sin rol | No se puede crear usuario sin rol asignado |
| `users:delete` | Solo SYSTEM_ADMIN y rol RRHH |
| Detección de cambios | `/auth/me` con polling cada 60s, compara `permissionsVersion` |
| Re-login | Soft: notificación + redirect, sin revocar refresh tokens |
| Entrega de permisos | Solo via `GET /auth/me` (no en login response) |
| Migración | Conservar roles actuales como punto de partida |

---

## Lista completa de permisos

```
inventory:view          inventory:view_assigned  inventory:create
inventory:edit          inventory:delete         inventory:export

warehouse:view          warehouse:create         warehouse:edit
warehouse:delete

categories:view         categories:create        categories:edit
categories:delete

suppliers:view          suppliers:create         suppliers:edit
suppliers:delete

users:view              users:create             users:edit
users:delete

transactions:view       transactions:create

stocktake:view          stocktake:create         stocktake:manage

transfers:view          transfers:create         transfers:manage

loans:view              loans:create             loans:manage

discharges:view         discharges:create        discharges:manage

reports:view            reports:export

audit:view              audit:export

alerts:view

settings:view           settings:edit
```

### Notas
- `inventory:view_assigned` es el permiso del rol EXTERNAL (solo ve ítems asignados a él)
- `alerts:view` se asigna a todos los roles por defecto
- SYSTEM_ADMIN no necesita permisos en DB — bypasea todos los checks

---

## Roles iniciales (migrados del enum actual)

| Nombre en DB | Display name UI | Notas |
|---|---|---|
| `SYSTEM_ADMIN` | Administrador del Sistema | isSystem=true, bypass implícito |
| `WAREHOUSE_MANAGER` | Gerente de Almacén | isSystem=true |
| `USER` | Operador | isSystem=true |
| `VIEWER` | Observador | isSystem=true |
| `EXTERNAL` | Externo | isSystem=true |

Los roles `isSystem=true` no se pueden eliminar desde la UI. Su `name` es inmutable. Solo se puede editar `displayName` y permisos asignados.

---

## Fases de implementación

> **Estado:** Fase 1 ✅ · Fase 2 ✅ · Fase 3 ✅ · Fase 4 ⬜ · Fase 5 ⬜ · Fase 6 ⬜ · Fase 7 ⬜

### Fase 1 — Schema y Seed (Backend) ✅

**1.1 Constante de permisos**
- Archivo: `src/common/constants/permissions.constant.ts`
- Array de objetos `{ key, module, action, description }`
- Fuente de verdad para seed y guards

**1.2 Nuevos modelos Prisma**
- Archivos: `prisma/schema.prisma` + `prisma/schema.prod.prisma` (ambos en sync)
- Agregar:
  - `Role` (id, name UNIQUE, displayName, description, isSystem Boolean, createdAt, updatedAt)
  - `Permission` (id, key UNIQUE, module, action, description)
  - `RolePermission` (id, roleId FK, permissionId FK, @@unique([roleId, permissionId]))
  - Campo `roleId String?` en `User` con relación a `Role` (nullable durante migración)
  - Campo `roleId String?` en `UserWarehouse` (anticipa multi-rol por almacén)
  - Campo `permissionsVersion Int @default(0)` en `User`
- Comando dev: `prisma db push` + `prisma generate` (NO `prisma migrate dev`)

**1.3 Script de migración/seed**
- Archivo: `src/seed/permissions-seed.service.ts`
- Pasos:
  1. Upsert todos los `Permission` records desde la constante
  2. Upsert los 5 `Role` records con `isSystem=true` y `displayName`
  3. Crear `RolePermission` según la matriz de permisos por rol (ver sección abajo)
  4. Para cada `User`: leer `user.role` (enum) → encontrar `Role` por name → setear `user.roleId`
- Debe ser idempotente (safe para correr múltiples veces)

**Matriz de permisos por rol inicial:**

| Permiso | SYSTEM_ADMIN | WAREHOUSE_MANAGER | USER | VIEWER | EXTERNAL |
|---------|:---:|:---:|:---:|:---:|:---:|
| inventory:view | bypass | ✓ | ✓ | ✓ | — |
| inventory:view_assigned | bypass | — | — | — | ✓ |
| inventory:create | bypass | ✓ | ✓ | — | — |
| inventory:edit | bypass | ✓ | ✓ | — | — |
| inventory:delete | bypass | ✓ | — | — | — |
| inventory:export | bypass | ✓ | — | ✓ | — |
| warehouse:view | bypass | ✓ | ✓ | ✓ | — |
| warehouse:create | bypass | ✓ | — | — | — |
| warehouse:edit | bypass | ✓ | — | — | — |
| warehouse:delete | bypass | — | — | — | — |
| categories:view | bypass | ✓ | ✓ | ✓ | — |
| categories:create | bypass | ✓ | ✓ | — | — |
| categories:edit | bypass | ✓ | ✓ | — | — |
| categories:delete | bypass | ✓ | — | — | — |
| suppliers:view | bypass | ✓ | ✓ | ✓ | — |
| suppliers:create | bypass | ✓ | ✓ | — | — |
| suppliers:edit | bypass | ✓ | ✓ | — | — |
| suppliers:delete | bypass | ✓ | — | — | — |
| users:view | bypass | — | — | — | — |
| users:create | bypass | — | — | — | — |
| users:edit | bypass | — | — | — | — |
| users:delete | bypass | — | — | — | — |
| transactions:view | bypass | ✓ | ✓ | ✓ | — |
| transactions:create | bypass | ✓ | ✓ | — | — |
| stocktake:view | bypass | ✓ | ✓ | ✓ | — |
| stocktake:create | bypass | ✓ | ✓ | — | — |
| stocktake:manage | bypass | ✓ | — | — | — |
| transfers:view | bypass | ✓ | ✓ | ✓ | — |
| transfers:create | bypass | ✓ | ✓ | — | — |
| transfers:manage | bypass | ✓ | — | — | — |
| loans:view | bypass | ✓ | ✓ | ✓ | — |
| loans:create | bypass | ✓ | ✓ | — | — |
| loans:manage | bypass | ✓ | — | — | — |
| discharges:view | bypass | ✓ | ✓ | ✓ | — |
| discharges:create | bypass | ✓ | ✓ | — | — |
| discharges:manage | bypass | ✓ | — | — | — |
| reports:view | bypass | ✓ | ✓ | ✓ | — |
| reports:export | bypass | ✓ | — | ✓ | — |
| audit:view | bypass | — | — | — | — |
| audit:export | bypass | — | — | — | — |
| alerts:view | bypass | ✓ | ✓ | ✓ | ✓ |
| settings:view | bypass | ✓ | — | — | — |
| settings:edit | bypass | — | — | — | — |

> Nota: `users:*` y `audit:*` son exclusivos de SYSTEM_ADMIN (y RRHH cuando se cree via UI).

---

### Fase 2 — Auth Refactor (Backend) ✅

**2.1 PermissionsService**
- Archivo: `src/permissions/permissions.service.ts`
- Métodos:
  - `getPermissionsForUser(userId): Promise<string[]>` — si SYSTEM_ADMIN retorna `['*']`, sino consulta DB via roleId
  - `getPermissionsForRole(roleId): Promise<string[]>`
  - `getUserPermissionsVersion(userId): Promise<number>`
- Cache en memoria (NestJS CacheModule, TTL 60s, clave = userId)
- Invalida cache cuando se modifican permisos del rol

**2.2 PermissionsModule**
- Archivo: `src/permissions/permissions.module.ts`
- Exporta `PermissionsService`, importa `PrismaModule`

**2.3 Decorator `@Permissions()`**
- Archivo: `src/auth/decorators/permissions.decorator.ts`
- `export const Permissions = (...perms: string[]) => SetMetadata(PERMISSIONS_KEY, perms)`

**2.4 PermissionsGuard**
- Archivo: `src/auth/guards/permissions.guard.ts`
- Lógica:
  1. Leer `PERMISSIONS_KEY` del handler/clase
  2. Si no hay permisos requeridos → permitir
  3. Si `user.role === 'SYSTEM_ADMIN'` → bypass + log audit
  4. Sino → consultar `PermissionsService.getPermissionsForUser(userId)`
  5. Verificar que el usuario tenga al menos uno de los permisos requeridos
  6. `ForbiddenException` si no cumple

**2.5 Actualizar `AuthenticatedUser` interface**
- Archivo: `src/auth/interfaces/auth-user.interface.ts`
- Agregar: `permissions?: string[]`, `permissionsVersion?: number`

**2.6 Endpoint `GET /auth/me`**
- Archivo: `src/auth/auth.controller.ts`
- Guard: `JwtAuthGuard` únicamente
- Response: `{ user: { id, email, name, role: { name, displayName } }, permissions: [...], permissionsVersion }`
- Resuelve permisos via `PermissionsService`

**2.7 Actualizar login response**
- Archivo: `src/auth/auth.service.ts`
- Agregar `permissionsVersion` al response
- No incluir `permissions` (se obtienen via `/auth/me`)

---

### Fase 3 — Migrar Controllers (Backend) ✅

**3.1 Mapeo de roles actuales a permisos**
- Documentar equivalencias antes de tocar código:
  - `@Roles('SYSTEM_ADMIN')` en delete → `@Permissions('inventory:delete')`
  - `@Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')` → `@Permissions('inventory:create')`
  - Endpoints abiertos a todos → solo `@UseGuards(JwtAuthGuard)`

**3.2 Migrar los ~14 controllers**
- Reemplazar `@UseGuards(JwtAuthGuard, RolesGuard)` → `@UseGuards(JwtAuthGuard, PermissionsGuard)`
- Reemplazar `@Roles(...)` → `@Permissions(...)`
- Controllers afectados:
  - inventory, warehouses, users, transactions, loans, transfer-requests
  - categories, suppliers, reports, audit, stock-take, discharge-requests
  - alerts, scheduled-reports, auth (endpoints admin), seed

**3.3 Restricción `users:delete`**
- Solo SYSTEM_ADMIN (bypass) y rol RRHH (creado via UI con `users:delete`)
- El seed puede opcionalmente crear un rol RRHH preconfigurado

**3.4 Audit log obligatorio para SYSTEM_ADMIN**
- En `PermissionsGuard`: cuando se detecta bypass de SYSTEM_ADMIN, registrar en `AuditLog`
- Campos: userId, acción (endpoint + método HTTP), entidad, fecha

**3.5 Deprecar `RolesGuard` y `@Roles()`**
- Marcar como `@deprecated` en JSDoc
- No eliminar hasta Fase 7

**3.6 Actualizar `CreateUserDto`**
- Archivo: `src/users/dto/create-user.dto.ts`
- Agregar `@IsString() @IsNotEmpty() roleId: string`
- Hacer `role` (enum) opcional temporalmente para compatibilidad

---

### Fase 4 — CRUD de Roles (Backend)

**4.1 RolesModule**
- Archivos: `src/roles/roles.module.ts`, `roles.service.ts`, `roles.controller.ts`
- Endpoints:
  - `GET /roles` — lista con conteo de permisos y usuarios
  - `GET /roles/:id` — detalle con permisos completos
  - `POST /roles` — crear rol custom (name, displayName, permissionIds)
  - `PATCH /roles/:id` — editar (name inmutable en isSystem; permisos editables)
  - `DELETE /roles/:id` — eliminar (bloqueado si isSystem o si tiene usuarios asignados)
  - `GET /permissions` — todos los permisos agrupados por módulo
- Guard: `@Permissions('settings:edit')` en todos los endpoints

**4.2 Trigger de re-login al cambiar permisos**
- Archivo: `src/roles/roles.service.ts`
- Al modificar permisos de un rol:
  1. `updateMany` en `User`: incrementar `permissionsVersion` donde `roleId = roleId`
  2. Invalidar cache de `PermissionsService` para usuarios afectados
  3. NO revocar refresh tokens (decisión: soft polling)

---

### Fase 5 — Permisos Dinámicos (Frontend)

**5.1 Renombrar permission keys**
- Cambiar formato: `view_inventory` → `inventory:view` en todos los archivos
- Afecta: `app.routes.ts`, todos los templates con `*ngxPermissionsOnly`, `permission.guard.ts`
- Usar búsqueda global antes de empezar para no omitir ninguno

**5.2 Actualizar `AuthUser` interface**
- Archivo: `src/app/interfaces/auth.interface.ts`
- Agregar: `permissions?: string[]`, `permissionsVersion?: number`

**5.3 Reescribir `PermissionsService`**
- Archivo: `src/app/core/services/permissions.service.ts`
- Eliminar: mapa hardcodeado `rolePermissions`, método `loadPermissions(role)`
- Agregar: `loadPermissionsFromApi(permissions: string[]): void`
- Mantener: `hasPermission(permission)`, `clearPermissions()`

**5.4 Polling en `AuthService`**
- Archivo: `src/app/services/auth.service.ts`
- `fetchMe(): Observable<MeResponse>` — llama `GET /auth/me`
- Al login y al iniciar app: llamar `fetchMe()` → cargar permisos
- Polling: `interval(60_000)` → llamar `fetchMe()` → comparar `permissionsVersion`
- Si versión cambió: limpiar auth, navegar a `/login` con mensaje "Tus permisos fueron actualizados, inicia sesión nuevamente"
- Guardar `permissionsVersion` en localStorage junto al usuario
- Detener polling en logout

---

### Fase 6 — UI de Administración de Roles (Frontend)

**6.1 `RolesService`**
- Archivo: `src/app/services/roles.service.ts`
- Wrappers HTTP para todos los endpoints de roles y permisos

**6.2 Componente `RolesComponent`**
- Archivo: `src/app/components/roles/roles.ts`
- Standalone con inline template, Tailwind, design tokens
- Tabla: displayName, name, conteo permisos, conteo usuarios, badge isSystem
- Botones: Crear, Editar, Eliminar (deshabilitado para isSystem)

**6.3 Diálogo `RoleFormDialog`**
- Archivo: `src/app/components/roles/role-form-dialog.ts`
- Campos: displayName, description
- Permisos: checkboxes agrupados por módulo
- Roles isSystem: name bloqueado, permisos editables

**6.4 Ruta y navegación**
- Agregar `/roles` en `app.routes.ts` con `permissionGuard('settings:edit')`
- Agregar enlace en sidebar bajo sección de administración
- i18n: agregar claves en `en.json` y `es.json`

**6.5 Actualizar componente de Usuarios**
- Dropdown de roles: dinámico desde `GET /roles` (muestra `displayName`)
- Al crear/editar usuario: enviar `roleId` en lugar de `role` string

---

### Fase 7 — Cleanup (post-estabilización)

> Ejecutar solo cuando todas las fases anteriores estén verificadas en producción.

- Eliminar campo `User.role` (enum) del schema
- Eliminar enum `UserRole` de Prisma
- Eliminar `RolesGuard` y `@Roles()` decorator
- Eliminar enum `UserRole` del frontend
- Actualizar todos los componentes que hacen switch sobre `UserRole`

---

## Archivos clave

### Backend (Inv-App-API)
| Archivo | Cambio |
|---------|--------|
| `prisma/schema.prisma` + `schema.prod.prisma` | Nuevos modelos Role, Permission, RolePermission; campos roleId y permissionsVersion |
| `src/common/constants/permissions.constant.ts` | NUEVO — lista completa de permisos |
| `src/seed/permissions-seed.service.ts` | NUEVO — migración de datos |
| `src/permissions/permissions.module.ts` + `permissions.service.ts` | NUEVO — resolución y cache de permisos |
| `src/auth/decorators/permissions.decorator.ts` | NUEVO — `@Permissions()` |
| `src/auth/guards/permissions.guard.ts` | NUEVO — reemplaza RolesGuard |
| `src/auth/guards/roles.guard.ts` | Deprecar |
| `src/auth/auth.controller.ts` | Agregar `GET /auth/me` |
| `src/auth/auth.service.ts` | Agregar `permissionsVersion` al login response |
| `src/auth/interfaces/auth-user.interface.ts` | Agregar `permissions`, `permissionsVersion` |
| `src/roles/roles.module.ts` + `roles.service.ts` + `roles.controller.ts` | NUEVO — CRUD de roles |
| `src/users/dto/create-user.dto.ts` | Agregar `roleId` requerido |
| `src/common/warehouse-access/warehouse-access.service.ts` | Actualizar check de SYSTEM_ADMIN |
| ~14 controllers | Migrar `@Roles()` → `@Permissions()` |

### Frontend (Inv-App)
| Archivo | Cambio |
|---------|--------|
| `src/app/core/services/permissions.service.ts` | Reescribir sin mapa hardcodeado |
| `src/app/services/auth.service.ts` | Agregar fetchMe(), polling, detección de cambio |
| `src/app/interfaces/auth.interface.ts` | Agregar `permissions`, `permissionsVersion` |
| `src/app/interfaces/user.interface.ts` | Mantener UserRole para transición, agregar tipo Role dinámico |
| `src/app/app.routes.ts` | Renombrar permission keys + agregar ruta /roles |
| `src/app/components/roles/` | NUEVO — RolesComponent + RoleFormDialog |
| `src/app/services/roles.service.ts` | NUEVO — HTTP wrappers |
| Todos los templates con `*ngxPermissionsOnly` | Renombrar keys |
| `src/assets/i18n/en.json` + `es.json` | Agregar claves de módulo roles |

---

## Criterios de éxito

- [x] Tablas `Role`, `Permission`, `RolePermission` creadas y seeded *(Fase 1 — 2026-03-28)*
- [x] Todos los usuarios existentes conservan exactamente los mismos accesos tras migración *(seed migra User.role → User.roleId)*
- [x] SYSTEM_ADMIN bypasea todos los checks sin consultar DB *(PermissionsGuard — Fase 2)*
- [x] `@Permissions('inventory:create')` funciona en todos los endpoints *(Fase 3 — 2026-03-28)*
- [x] `GET /auth/me` devuelve permisos correctos para cada rol *(Fase 2 — 2026-03-28)*
- [ ] Frontend carga permisos desde API, no desde mapa local *(Fase 5 — pendiente)*
- [ ] Cambios de permisos detectados en máximo 60 segundos *(Fase 5 — pendiente)*
- [ ] UI permite crear roles custom y asignar permisos *(Fase 4/6 — pendiente)*
- [ ] Roles isSystem no se pueden eliminar *(Fase 4 — pendiente)*
- [x] `users:delete` restringido a SYSTEM_ADMIN (bypass) — RRHH role pendiente de Fase 4
- [ ] No se puede crear usuario sin rol *(Fase 3.6 + Fase 5 — pendiente)*
- [ ] Todas las acciones de SYSTEM_ADMIN quedan en audit log *(Fase 3.4 — pendiente)*
- [x] Ambos schemas (SQLite y PostgreSQL) en sync *(Fase 1 — 2026-03-28)*
- [ ] Cobertura de tests ≥ 80% en código nuevo *(pendiente)*
