# Guía de Permisos - INV-APP

## Roles Disponibles

1. **SYSTEM_ADMIN** - Administrador del Sistema
   - Acceso completo a todas las funciones
   - Puede gestionar usuarios, configuraciones globales

2. **WAREHOUSE_MANAGER** - Encargado de Bodega
   - Gestión completa de inventario, bodegas y transacciones
   - No puede gestionar usuarios ni configuraciones de sistema

3. **USER** - Usuario
   - Puede ver, crear y editar inventario
   - Acceso limitado a eliminación

4. **VIEWER** - Visor
   - Solo lectura en todas las secciones

5. **EXTERNAL** - Usuario Externo
   - Acceso mínimo, solo puede ver items asignados a él

## Uso de Permisos en Templates

### Ocultar/Mostrar elementos según permisos

```html
<!-- Mostrar solo si tiene permiso específico -->
<button *ngxPermissionsOnly="['delete_inventory']">
  Eliminar
</button>

<!-- Mostrar solo si tiene el rol -->
<button *ngxPermissionsOnly="['SYSTEM_ADMIN']">
  Configuración
</button>

<!-- Mostrar solo si NO tiene el permiso -->
<div *ngxPermissionsExcept="['delete_users']">
  Vista restringida
</div>

<!-- Múltiples permisos (OR) -->
<button *ngxPermissionsOnly="['edit_inventory', 'create_inventory']">
  Modificar
</button>
```

### Ejemplos Prácticos

```html
<!-- Botón de eliminar solo para admins y managers -->
<button
  *ngxPermissionsOnly="['delete_inventory']"
  (click)="deleteItem(item)"
  class="btn-danger">
  <mat-icon>delete</mat-icon>
  Eliminar
</button>

<!-- Sección de usuarios solo para admin del sistema -->
<a
  routerLink="/users"
  *ngxPermissionsOnly="['view_users']"
  class="nav-link">
  <mat-icon>people</mat-icon>
  Usuarios
</a>

<!-- Mostrar acciones según rol -->
<div class="actions">
  <button *ngxPermissionsOnly="['create_inventory']">Crear</button>
  <button *ngxPermissionsOnly="['edit_inventory']">Editar</button>
  <button *ngxPermissionsOnly="['delete_inventory']">Eliminar</button>
</div>

<!-- Mensaje para usuarios sin permisos -->
<div *ngxPermissionsExcept="['view_inventory']">
  No tienes permisos para ver el inventario.
</div>
```

## Uso en TypeScript

```typescript
import { Component, inject } from '@angular/core';
import { PermissionsService } from './services/permissions.service';

@Component({...})
export class MyComponent {
  private permissionsService = inject(PermissionsService);

  canDelete(): boolean {
    return this.permissionsService.hasPermission('delete_inventory');
  }

  isAdmin(): boolean {
    return this.permissionsService.hasRole(UserRole.SYSTEM_ADMIN);
  }

  deleteItem(item: any): void {
    if (!this.canDelete()) {
      alert('No tienes permiso para eliminar');
      return;
    }
    // Proceder con eliminación
  }
}
```

## Guards para Rutas

Puedes crear guards personalizados para proteger rutas enteras:

```typescript
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { PermissionsService } from './services/permissions.service';

export const adminGuard: CanActivateFn = () => {
  const permissionsService = inject(PermissionsService);
  const router = inject(Router);

  if (permissionsService.hasRole(UserRole.SYSTEM_ADMIN)) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};

// En app.routes.ts
{
  path: 'users',
  component: UsersComponent,
  canActivate: [authGuard, adminGuard]
}
```

## Matriz de Permisos

| Permiso | SYSTEM_ADMIN | WAREHOUSE_MANAGER | USER | VIEWER | EXTERNAL |
|---------|--------------|-------------------|------|--------|----------|
| view_users | ✅ | ❌ | ❌ | ❌ | ❌ |
| create_users | ✅ | ❌ | ❌ | ❌ | ❌ |
| edit_users | ✅ | ❌ | ❌ | ❌ | ❌ |
| delete_users | ✅ | ❌ | ❌ | ❌ | ❌ |
| view_inventory | ✅ | ✅ | ✅ | ✅ | ❌ |
| create_inventory | ✅ | ✅ | ✅ | ❌ | ❌ |
| edit_inventory | ✅ | ✅ | ✅ | ❌ | ❌ |
| delete_inventory | ✅ | ✅ | ❌ | ❌ | ❌ |
| view_warehouses | ✅ | ✅ | ✅ | ✅ | ❌ |
| create_warehouses | ✅ | ✅ | ❌ | ❌ | ❌ |
| edit_warehouses | ✅ | ✅ | ❌ | ❌ | ❌ |
| delete_warehouses | ✅ | ❌ | ❌ | ❌ | ❌ |
| view_categories | ✅ | ✅ | ✅ | ✅ | ❌ |
| create_categories | ✅ | ✅ | ❌ | ❌ | ❌ |
| view_suppliers | ✅ | ✅ | ✅ | ✅ | ❌ |
| create_suppliers | ✅ | ✅ | ❌ | ❌ | ❌ |
| view_transactions | ✅ | ✅ | ✅ | ✅ | ❌ |
| create_transactions | ✅ | ✅ | ✅ | ❌ | ❌ |
| view_settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| edit_settings | ✅ | ❌ | ❌ | ❌ | ❌ |
| view_dashboard | ✅ | ✅ | ✅ | ✅ | ❌ |
| view_reports | ✅ | ✅ | ❌ | ❌ | ❌ |
| view_assigned_items | ❌ | ❌ | ❌ | ❌ | ✅ |

## Mejores Prácticas

1. **Siempre validar permisos en el backend** - La validación en el frontend es solo para UX
2. **Usar permisos específicos** - Prefiere `delete_inventory` sobre `SYSTEM_ADMIN` en templates
3. **Combinar con auth guard** - Protege rutas primero con autenticación, luego con permisos
4. **Feedback al usuario** - Muestra mensajes cuando no tenga permisos
5. **Ocultar vs Deshabilitar** - Oculta funciones que el usuario nunca debería ver, deshabilita las que podrían necesitar contexto

## Ejemplo Completo: Botones de Acción

```html
<div class="item-actions" *ngIf="item">
  <!-- Ver siempre disponible para usuarios con acceso a inventario -->
  <button
    *ngxPermissionsOnly="['view_inventory']"
    (click)="viewItem(item)">
    <mat-icon>visibility</mat-icon>
    Ver
  </button>

  <!-- Editar solo para quienes pueden editar -->
  <button
    *ngxPermissionsOnly="['edit_inventory']"
    (click)="editItem(item)">
    <mat-icon>edit</mat-icon>
    Editar
  </button>

  <!-- Eliminar solo para admins y managers -->
  <button
    *ngxPermissionsOnly="['delete_inventory']"
    (click)="deleteItem(item)"
    class="btn-danger">
    <mat-icon>delete</mat-icon>
    Eliminar
  </button>
</div>
```
