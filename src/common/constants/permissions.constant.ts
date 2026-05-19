/** Source of truth for all system permissions. Used by seed and guards. */
export const PERMISSIONS = [
  // inventory
  { key: 'inventory:view',          module: 'inventory',     action: 'view',          description: 'View inventory items' },
  { key: 'inventory:view_assigned', module: 'inventory',     action: 'view_assigned', description: 'View only items assigned to the user (EXTERNAL)' },
  { key: 'inventory:create',        module: 'inventory',     action: 'create',        description: 'Create inventory items' },
  { key: 'inventory:edit',          module: 'inventory',     action: 'edit',          description: 'Edit inventory items' },
  { key: 'inventory:delete',        module: 'inventory',     action: 'delete',        description: 'Delete inventory items' },
  { key: 'inventory:export',        module: 'inventory',     action: 'export',        description: 'Export inventory data' },
  // warehouse
  { key: 'warehouse:view',          module: 'warehouse',     action: 'view',          description: 'View warehouses' },
  { key: 'warehouse:create',        module: 'warehouse',     action: 'create',        description: 'Create warehouses' },
  { key: 'warehouse:edit',          module: 'warehouse',     action: 'edit',          description: 'Edit warehouses' },
  { key: 'warehouse:delete',        module: 'warehouse',     action: 'delete',        description: 'Delete warehouses' },
  // categories
  { key: 'categories:view',         module: 'categories',    action: 'view',          description: 'View categories' },
  { key: 'categories:create',       module: 'categories',    action: 'create',        description: 'Create categories' },
  { key: 'categories:edit',         module: 'categories',    action: 'edit',          description: 'Edit categories' },
  { key: 'categories:delete',       module: 'categories',    action: 'delete',        description: 'Delete categories' },
  // suppliers
  { key: 'suppliers:view',          module: 'suppliers',     action: 'view',          description: 'View suppliers' },
  { key: 'suppliers:create',        module: 'suppliers',     action: 'create',        description: 'Create suppliers' },
  { key: 'suppliers:edit',          module: 'suppliers',     action: 'edit',          description: 'Edit suppliers' },
  { key: 'suppliers:delete',        module: 'suppliers',     action: 'delete',        description: 'Delete suppliers' },
  // users
  { key: 'users:view',              module: 'users',         action: 'view',          description: 'View users' },
  { key: 'users:create',            module: 'users',         action: 'create',        description: 'Create users' },
  { key: 'users:edit',              module: 'users',         action: 'edit',          description: 'Edit users' },
  { key: 'users:delete',            module: 'users',         action: 'delete',        description: 'Delete users (SYSTEM_ADMIN / HR only)' },
  // transactions
  { key: 'transactions:view',       module: 'transactions',  action: 'view',          description: 'View transactions' },
  { key: 'transactions:create',     module: 'transactions',  action: 'create',        description: 'Create transactions' },
  { key: 'transactions:edit',       module: 'transactions',  action: 'edit',          description: 'Edit transactions' },
  // stocktake
  { key: 'stocktake:view',          module: 'stocktake',     action: 'view',          description: 'View stock takes' },
  { key: 'stocktake:create',        module: 'stocktake',     action: 'create',        description: 'Create stock takes' },
  { key: 'stocktake:manage',        module: 'stocktake',     action: 'manage',        description: 'Complete / cancel stock takes' },
  // transfers
  { key: 'transfers:view',          module: 'transfers',     action: 'view',          description: 'View transfer requests' },
  { key: 'transfers:create',        module: 'transfers',     action: 'create',        description: 'Create transfer requests' },
  { key: 'transfers:manage',        module: 'transfers',     action: 'manage',        description: 'Approve / reject transfer requests' },
  // loans
  { key: 'loans:view',              module: 'loans',         action: 'view',          description: 'View loans' },
  { key: 'loans:create',            module: 'loans',         action: 'create',        description: 'Create loans' },
  { key: 'loans:manage',            module: 'loans',         action: 'manage',        description: 'Confirm receipt / return of loans' },
  // discharges
  { key: 'discharges:view',         module: 'discharges',    action: 'view',          description: 'View discharge requests' },
  { key: 'discharges:create',       module: 'discharges',    action: 'create',        description: 'Create discharge requests' },
  { key: 'discharges:manage',       module: 'discharges',    action: 'manage',        description: 'Resolve discharge requests' },
  // outflows (salidas / write-offs)
  { key: 'outflows:view',           module: 'outflows',      action: 'view',          description: 'View outflows (write-offs)' },
  { key: 'outflows:create',         module: 'outflows',      action: 'create',        description: 'Create outflows (write-offs)' },
  { key: 'outflows:cancel',         module: 'outflows',      action: 'cancel',        description: 'Cancel outflows and restore stock' },
  // reports
  { key: 'reports:view',            module: 'reports',       action: 'view',          description: 'View reports' },
  { key: 'reports:export',          module: 'reports',       action: 'export',        description: 'Export reports' },
  // audit
  { key: 'audit:view',              module: 'audit',         action: 'view',          description: 'View audit log' },
  { key: 'audit:export',            module: 'audit',         action: 'export',        description: 'Export audit log' },
  // alerts
  { key: 'alerts:view',             module: 'alerts',        action: 'view',          description: 'View stock alerts' },
  { key: 'alerts:manage',           module: 'alerts',        action: 'manage',        description: 'Resolve / mark alerts as notified' },
  // transactions (extended)
  { key: 'transactions:delete',     module: 'transactions',  action: 'delete',        description: 'Delete transactions (SYSTEM_ADMIN only)' },
  // loans (extended)
  { key: 'loans:delete',            module: 'loans',         action: 'delete',        description: 'Delete loans (SYSTEM_ADMIN only)' },
  // settings
  { key: 'settings:view',           module: 'settings',      action: 'view',          description: 'View system settings' },
  { key: 'settings:edit',           module: 'settings',      action: 'edit',          description: 'Edit system settings' },
  // dashboard
  { key: 'dashboard:view',          module: 'dashboard',     action: 'view',          description: 'View the main dashboard' },
  // auth admin — intentionally not assigned to any role; SYSTEM_ADMIN bypasses the check
  { key: 'auth:admin',              module: 'auth',          action: 'admin',         description: 'Perform privileged auth operations (password resets, admin links)' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

/** Permission matrix per initial role. SYSTEM_ADMIN bypasses all checks (not stored in DB). */
export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  WAREHOUSE_MANAGER: [
    'inventory:view', 'inventory:create', 'inventory:edit', 'inventory:delete', 'inventory:export',
    'warehouse:view', 'warehouse:create', 'warehouse:edit',
    'categories:view', 'categories:create', 'categories:edit', 'categories:delete',
    'suppliers:view', 'suppliers:create', 'suppliers:edit', 'suppliers:delete',
    'transactions:view', 'transactions:create', 'transactions:edit',
    'stocktake:view', 'stocktake:create', 'stocktake:manage',
    'transfers:view', 'transfers:create', 'transfers:manage',
    'loans:view', 'loans:create', 'loans:manage',
    'discharges:view', 'discharges:create', 'discharges:manage',
    'outflows:view', 'outflows:create', 'outflows:cancel',
    'reports:view', 'reports:export',
    'alerts:view', 'alerts:manage',
    'settings:view',
    'dashboard:view',
  ],
  USER: [
    'inventory:view', 'inventory:create', 'inventory:edit',
    'warehouse:view',
    'categories:view', 'categories:create', 'categories:edit',
    'suppliers:view', 'suppliers:create', 'suppliers:edit',
    'transactions:view', 'transactions:create', 'transactions:edit',
    'stocktake:view', 'stocktake:create',
    'transfers:view', 'transfers:create',
    'loans:view', 'loans:create',
    'discharges:view', 'discharges:create',
    'outflows:view', 'outflows:create',
    'reports:view',
    'alerts:view',
    'dashboard:view',
  ],
  VIEWER: [
    'inventory:view', 'inventory:export',
    'warehouse:view',
    'categories:view',
    'suppliers:view',
    'transactions:view',
    'stocktake:view',
    'transfers:view',
    'loans:view',
    'discharges:view',
    'outflows:view',
    'reports:view', 'reports:export',
    'alerts:view',
    'dashboard:view',
  ],
  EXTERNAL: [
    'inventory:view_assigned',
    'alerts:view',
  ],
};

export const INITIAL_ROLES = [
  { name: 'SYSTEM_ADMIN',      displayName: 'Administrador del Sistema', description: 'Full system access. Bypasses all permission checks.' },
  { name: 'WAREHOUSE_MANAGER', displayName: 'Gerente de Almacén',        description: 'Manages inventory, warehouses, and operations.' },
  { name: 'USER',              displayName: 'Operador',                   description: 'Basic operational access.' },
  { name: 'VIEWER',            displayName: 'Observador',                 description: 'Read-only access across modules.' },
  { name: 'EXTERNAL',          displayName: 'Externo',                    description: 'Minimal access for external users or contractors.' },
] as const;
