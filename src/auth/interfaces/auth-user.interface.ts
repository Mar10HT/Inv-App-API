// Represents the authenticated user attached to request after JWT + warehouse access resolution
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  warehouseIds: string[] | null; // null = SYSTEM_ADMIN (unrestricted access)
  permissions?: string[];        // Loaded lazily via /auth/me polling
  permissionsVersion?: number;   // Incremented when role permissions change

  // Multi-tenant context (Phase 2+). Both undefined for SUPER_ADMIN and for
  // legacy tokens minted before MULTI_TENANT_ENABLED=true.
  orgId?: string;
  orgRole?: 'OWNER' | 'ORG_ADMIN' | 'MEMBER' | 'EXTERNAL';
}
