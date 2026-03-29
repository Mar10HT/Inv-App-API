import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS, INITIAL_ROLES, ROLE_PERMISSIONS } from '../common/constants';

@Injectable()
export class PermissionsSeedService {
  private readonly logger = new Logger(PermissionsSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent seed for RBAC tables.
   *
   * Steps:
   *  1. Upsert all Permission records from the constant
   *  2. Upsert 5 initial Role records (isSystem = true)
   *  3. Sync RolePermission assignments per the matrix
   *  4. Migrate existing users: map User.role (enum) → User.roleId
   */
  async run(): Promise<SeedResult> {
    this.logger.log('Starting RBAC permissions seed...');

    const permissionsSeeded = await this.seedPermissions();
    const rolesSeeded       = await this.seedRoles();
    await this.syncRolePermissions();
    const usersLinked       = await this.migrateUserRoles();

    this.logger.log('RBAC seed complete.');

    return { permissionsSeeded, rolesSeeded, usersLinked };
  }

  // ── Step 1 ──────────────────────────────────────────────────────────────────

  private async seedPermissions(): Promise<number> {
    let count = 0;

    for (const p of PERMISSIONS) {
      await this.prisma.permission.upsert({
        where:  { key: p.key },
        update: { module: p.module, action: p.action, description: p.description },
        create: { key: p.key, module: p.module, action: p.action, description: p.description },
      });
      count++;
    }

    this.logger.log(`Upserted ${count} permissions.`);
    return count;
  }

  // ── Step 2 ──────────────────────────────────────────────────────────────────

  private async seedRoles(): Promise<number> {
    let count = 0;

    for (const r of INITIAL_ROLES) {
      await this.prisma.role.upsert({
        where:  { name: r.name },
        update: { displayName: r.displayName, description: r.description },
        create: { name: r.name, displayName: r.displayName, description: r.description, isSystem: true },
      });
      count++;
    }

    this.logger.log(`Upserted ${count} roles.`);
    return count;
  }

  // ── Step 3 ──────────────────────────────────────────────────────────────────

  private async syncRolePermissions(): Promise<void> {
    // Bulk-load all roles and permissions once to avoid N+1 sequential queries.
    const [allRoles, allPermissions] = await Promise.all([
      this.prisma.role.findMany({ select: { id: true, name: true } }),
      this.prisma.permission.findMany({ select: { id: true, key: true } }),
    ]);

    const roleByName = new Map(allRoles.map((r) => [r.name, r]));
    const permByKey  = new Map(allPermissions.map((p) => [p.key, p]));

    for (const [roleName, permKeys] of Object.entries(ROLE_PERMISSIONS)) {
      const role = roleByName.get(roleName);
      if (!role) {
        this.logger.warn(`Role not found: ${roleName} — skipping permission sync.`);
        continue;
      }

      // Resolve the desired permission IDs for this role from the constant.
      const desiredPermIds = new Set<string>();
      for (const key of permKeys) {
        const permission = permByKey.get(key);
        if (!permission) {
          this.logger.warn(`Permission not found: ${key} — skipping.`);
          continue;
        }
        desiredPermIds.add(permission.id);
      }

      // Load the current DB assignments for this role.
      const existing = await this.prisma.rolePermission.findMany({
        where:  { roleId: role.id },
        select: { permissionId: true },
      });
      const existingIds = new Set(existing.map((rp) => rp.permissionId));

      // Add missing, remove stale — keeps the DB in sync with the constant.
      const toAdd    = [...desiredPermIds].filter((id) => !existingIds.has(id));
      const toRemove = [...existingIds].filter((id) => !desiredPermIds.has(id));

      if (toAdd.length > 0) {
        await this.prisma.rolePermission.createMany({
          data: toAdd.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        });
      }

      if (toRemove.length > 0) {
        await this.prisma.rolePermission.deleteMany({
          where: { roleId: role.id, permissionId: { in: toRemove } },
        });
      }

      this.logger.log(
        `Synced permissions for role: ${roleName} (+${toAdd.length} / -${toRemove.length})`,
      );
    }
  }

  // ── Step 4 ──────────────────────────────────────────────────────────────────

  private async migrateUserRoles(): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { roleId: null },
      select: { id: true, role: true },
    });

    let count = 0;

    for (const user of users) {
      const roleRecord = await this.prisma.role.findUnique({
        where: { name: user.role },
      });

      if (!roleRecord) {
        this.logger.warn(`No Role record found for enum value "${user.role}" (userId: ${user.id}) — skipping.`);
        continue;
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data:  { roleId: roleRecord.id },
      });

      count++;
    }

    this.logger.log(`Linked roleId for ${count} users.`);
    return count;
  }
}

interface SeedResult {
  permissionsSeeded: number;
  rolesSeeded:       number;
  usersLinked:       number;
}
