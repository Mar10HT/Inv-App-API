// Represents the authenticated user attached to request after JWT + warehouse access resolution
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
  warehouseIds: string[] | null; // null = SYSTEM_ADMIN (unrestricted access)
  permissions?: string[];        // Loaded lazily via /auth/me polling
  permissionsVersion?: number;   // Incremented when role permissions change
}
