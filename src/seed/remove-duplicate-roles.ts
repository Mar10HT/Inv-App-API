import type { PrismaClient } from '@prisma/client';
import { INITIAL_ROLES } from '../common/constants';

type RolesClient = Pick<PrismaClient, 'role' | 'user' | 'userWarehouse'>;

/**
 * Deletes lowercase copies of the system roles ("warehouse_manager", "user",
 * "viewer", ...) that the old scripts/seed-data.ts created next to the real
 * uppercase ones. Users and warehouse assignments pointing at a copy are moved
 * to the matching system role first, so nobody loses access.
 *
 * Returns the names of the deleted roles.
 */
export async function removeDuplicateRoles(
  prisma: RolesClient,
): Promise<string[]> {
  const canonicalNames = new Set(INITIAL_ROLES.map((r) => r.name));
  const roles = await prisma.role.findMany({
    select: { id: true, name: true },
  });
  const canonicalByName = new Map(
    roles.filter((r) => canonicalNames.has(r.name)).map((r) => [r.name, r]),
  );

  const deleted: string[] = [];
  for (const role of roles) {
    if (canonicalNames.has(role.name)) continue;
    const canonical = canonicalByName.get(role.name.toUpperCase());
    if (!canonical) continue;

    await prisma.user.updateMany({
      where: { roleId: role.id },
      data: { roleId: canonical.id },
    });
    await prisma.userWarehouse.updateMany({
      where: { roleId: role.id },
      data: { roleId: canonical.id },
    });
    await prisma.role.delete({ where: { id: role.id } });
    deleted.push(role.name);
  }
  return deleted;
}
