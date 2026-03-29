import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_MS = 60_000; // 60 seconds

interface CacheEntry {
  permissions: string[];
  expiresAt: number;
}

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the full list of permission keys for a user.
   * SYSTEM_ADMIN always returns ['*'] (bypass — never stored in DB).
   * Result is cached for 60 seconds keyed by userId.
   */
  async getPermissionsForUser(userId: string): Promise<string[]> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.permissions;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        roleId: true,
        permissionsVersion: true,
      },
    });

    if (!user) return [];

    // Legacy enum check during transition (removed in Phase 7)
    if (user.role === 'SYSTEM_ADMIN') {
      return this.setCache(userId, ['*']);
    }

    if (!user.roleId) {
      this.logger.warn(`User ${userId} has no roleId assigned — returning empty permissions.`);
      return this.setCache(userId, []);
    }

    const permissions = await this.getPermissionsForRole(user.roleId);
    return this.setCache(userId, permissions);
  }

  /**
   * Returns permission keys for a given roleId.
   * Does not use the user cache — call invalidateRoleCache to clear affected users.
   */
  async getPermissionsForRole(roleId: string): Promise<string[]> {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId },
      include: { permission: { select: { key: true } } },
    });

    return rolePermissions.map((rp) => rp.permission.key);
  }

  /**
   * Returns the current permissionsVersion for a user.
   * Used by the frontend polling to detect permission changes.
   */
  async getUserPermissionsVersion(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { permissionsVersion: true },
    });

    return user?.permissionsVersion ?? 0;
  }

  /** Clears the cache entry for a single user. */
  invalidateUserCache(userId: string): void {
    this.cache.delete(userId);
  }

  /**
   * Clears cache entries for all users assigned to a given role.
   * Call this after updating a role's permissions in RolesService.
   */
  async invalidateRoleCache(roleId: string): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { roleId },
      select: { id: true },
    });

    for (const user of users) {
      this.cache.delete(user.id);
    }

    this.logger.log(`Invalidated permission cache for ${users.length} users in role ${roleId}.`);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private setCache(userId: string, permissions: string[]): string[] {
    this.cache.set(userId, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
    return permissions;
  }
}
