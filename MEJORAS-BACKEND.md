# Backend - Issues & Improvements

## CRITICAL

### 1. N+1 Queries en Transfer `confirmReceipt()` ✅ COMPLETADO
**Archivo:** `src/transfer-requests/transfer-requests.service.ts`

**Fix aplicado:** Refactorizado para usar `$transaction()` con `Promise.all()` para operaciones bulk en paralelo.

---

### 2. N+1 Queries en Discharge `complete()` ✅ COMPLETADO
**Archivo:** `src/discharge-requests/discharge-requests.service.ts`

**Fix aplicado:** Validación y decrementos combinados en una sola transacción. Race condition eliminada.

---

### 3. `resetAll()` hace hard delete en vez de soft delete ✅ COMPLETADO
**Archivo:** `src/inventory/inventory.service.ts`

**Fix aplicado:** Cambiado `deleteMany({})` a `updateMany({ data: { deletedAt: new Date() } })`.

---

### 4. Missing cascading deletes ⚠️ PARCIAL
**Archivo:** `prisma/schema.prisma`

- ✅ `TransferRequestItem` → `onDelete: Cascade`
- ✅ `DischargeRequestItem` → `onDelete: Cascade`
- ❌ `Loan.inventoryItemId` → **falta `onDelete: Cascade`**

---

### 5. Transfer confirmation modifica inventario fuera de transacción ✅ COMPLETADO
**Archivo:** `src/transfer-requests/transfer-requests.service.ts`

**Fix aplicado:** Toda la manipulación de inventario envuelta en `$transaction()` (resuelto junto con issue #1).

---

## IMPORTANT

### 6. Refresh token rotation sin transacción ✅ COMPLETADO
**Archivo:** `src/auth/auth.service.ts`

**Fix aplicado:** Revocación + creación de token envueltas en `$transaction()`.

---

### 7. Error messages exponen IDs internos ✅ COMPLETADO
**Archivos:** Múltiples servicios

**Fix aplicado:** Mensajes genéricos sin IDs internos en todos los servicios.

---

### 8. Discharge Request - public endpoint sin rate limiting ❌ PENDIENTE
**Archivo:** `src/discharge-requests/discharge-requests.controller.ts`

`POST /discharge-requests/public` no tiene `@Throttle()` específico. Solo hay throttling global en `app.module.ts`.

**Fix:** Agregar `@Throttle(5, 60)` al endpoint público.

---

### 9. Input validation faltante en Reports ❌ PENDIENTE
**Archivo:** `src/reports/reports.controller.ts`

```typescript
@Query('startDate') startDate?: string,  // Sin validación
@Query('endDate') endDate?: string,       // Sin validación
```

**Fix:** Crear DTO con `@IsDateString()` o `@IsISO8601()`.

---

### 10. Email failures se tragan silenciosamente ✅ COMPLETADO
**Archivo:** `src/auth/auth.service.ts`

**Fix aplicado:** Error handling con try/catch y logging estructurado en `email.service.ts`.

---

### 11. Case sensitivity inconsistente en email ✅ COMPLETADO
**Archivos:** DTOs de auth

**Fix aplicado:** `@Transform(({ value }) => value?.toLowerCase().trim())` en `login.dto.ts`, `register.dto.ts`, `forgot-password.dto.ts`, `update-profile.dto.ts`.

---

### 12. Bulk update audit logging no es atómico ❌ PENDIENTE
**Archivo:** `src/inventory/inventory.service.ts`

El bulk update sigue logueando audit fuera de la transacción. Si falla a mitad, algunos items quedan sin audit log.

**Fix:** Envolver operación completa en `$transaction()`.

---

## MINOR

### 13. Discharge request no re-valida soft-delete en `complete()` ✅ COMPLETADO
**Archivo:** `src/discharge-requests/discharge-requests.service.ts`

**Fix aplicado:** Agregada verificación `deletedAt: null` en la query de validación.

---

### 14. Transfer no valida warehouse `isActive` ❌ PENDIENTE
**Archivo:** `src/transfer-requests/transfer-requests.service.ts`

Valida que los warehouses existan pero no verifica `isActive`.

**Fix:** Agregar `where: { isActive: true }` al lookup.

---

### 15. Password reset tokens expirados no se invalidan al crear nuevos ✅ COMPLETADO
**Archivo:** `src/auth/auth.service.ts`

**Fix aplicado:** Se invalidan tokens existentes al crear nuevos.

---

## Resumen

| Severidad | Total | ✅ | ⚠️ | ❌ |
|-----------|-------|---|---|---|
| CRITICAL  | 5     | 4 | 1 | 0 |
| IMPORTANT | 7     | 4 | 0 | 3 |
| MINOR     | 3     | 2 | 0 | 1 |
| **TOTAL** | **15**| **10** | **1** | **4** |

## Pendientes
1. Cascading delete para `Loan.inventoryItemId` (#4)
2. Rate limiting en endpoint público (#8)
3. Validación de fechas en Reports (#9)
4. Bulk update audit atómico (#12)
5. Validar warehouse `isActive` en transfers (#14)
