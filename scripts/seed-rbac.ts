/**
 * Standalone RBAC seed: upserts Permission + Role rows and syncs RolePermission
 * assignments from src/common/constants, mirroring PermissionsSeedService.run().
 *
 * Exists because the equivalent API endpoint (POST /seed/permissions) is
 * deliberately disabled when NODE_ENV=production. Run this against a target
 * database directly instead of hitting that endpoint:
 *
 *   npx prisma generate --schema=./prisma/schema.prod.prisma
 *   DATABASE_URL="<prod connection string from Railway>" npx ts-node scripts/seed-rbac.ts
 *   npx prisma generate   # restores the local SQLite dev client afterward
 *
 * Idempotent: safe to run more than once, on dev or prod.
 */
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, INITIAL_ROLES, ROLE_PERMISSIONS } from '../src/common/constants';

const prisma = new PrismaClient();

async function seedPermissions(): Promise<number> {
  let count = 0;
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { module: p.module, action: p.action, description: p.description },
      create: { key: p.key, module: p.module, action: p.action, description: p.description },
    });
    count++;
  }
  console.log(`Upserted ${count} permissions.`);
  return count;
}

async function seedRoles(): Promise<number> {
  let count = 0;
  for (const r of INITIAL_ROLES) {
    await prisma.role.upsert({
      where: { name: r.name },
      update: { displayName: r.displayName, description: r.description },
      create: { name: r.name, displayName: r.displayName, description: r.description, isSystem: true },
    });
    count++;
  }
  console.log(`Upserted ${count} roles.`);
  return count;
}

async function syncRolePermissions(): Promise<void> {
  const [allRoles, allPermissions] = await Promise.all([
    prisma.role.findMany({ select: { id: true, name: true } }),
    prisma.permission.findMany({ select: { id: true, key: true } }),
  ]);
  const roleByName = new Map(allRoles.map((r) => [r.name, r]));
  const permByKey = new Map(allPermissions.map((p) => [p.key, p]));

  for (const [roleName, permKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = roleByName.get(roleName);
    if (!role) {
      console.warn(`Role not found: ${roleName} — skipping.`);
      continue;
    }

    const desiredPermIds = new Set<string>();
    for (const key of permKeys) {
      const permission = permByKey.get(key);
      if (!permission) {
        console.warn(`Permission not found: ${key} — skipping.`);
        continue;
      }
      desiredPermIds.add(permission.id);
    }

    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const existingIds = new Set(existing.map((rp) => rp.permissionId));

    const toAdd = [...desiredPermIds].filter((id) => !existingIds.has(id));
    const toRemove = [...existingIds].filter((id) => !desiredPermIds.has(id));

    if (toAdd.length > 0) {
      await prisma.rolePermission.createMany({
        data: toAdd.map((permissionId) => ({ roleId: role.id, permissionId })),
      });
    }
    if (toRemove.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionId: { in: toRemove } },
      });
    }

    console.log(`Synced permissions for role: ${roleName} (+${toAdd.length} / -${toRemove.length})`);
  }
}

async function migrateUserRoles(): Promise<number> {
  const users = await prisma.user.findMany({
    where: { roleId: null },
    select: { id: true, role: true },
  });

  let count = 0;
  for (const user of users) {
    const roleRecord = await prisma.role.findUnique({ where: { name: user.role } });
    if (!roleRecord) {
      console.warn(`No Role record found for enum value "${user.role}" (userId: ${user.id}) — skipping.`);
      continue;
    }
    await prisma.user.update({ where: { id: user.id }, data: { roleId: roleRecord.id } });
    count++;
  }
  console.log(`Linked roleId for ${count} users.`);
  return count;
}

async function main(): Promise<void> {
  console.log('Starting RBAC seed...');
  await seedPermissions();
  await seedRoles();
  await syncRolePermissions();
  await migrateUserRoles();
  console.log('RBAC seed complete.');
}

main()
  .catch((e) => {
    console.error('RBAC seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
