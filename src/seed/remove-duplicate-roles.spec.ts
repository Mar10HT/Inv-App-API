import { removeDuplicateRoles } from './remove-duplicate-roles';

describe('removeDuplicateRoles', () => {
  const setup = (roles: { id: string; name: string }[]) => {
    const prisma = {
      role: {
        findMany: jest.fn().mockResolvedValue(roles),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      user: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userWarehouse: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    return prisma;
  };

  it('moves users and warehouse assignments to the system role, then deletes the lowercase copy', async () => {
    const prisma = setup([
      { id: 'sys-user', name: 'USER' },
      { id: 'old-user', name: 'user' },
    ]);

    const deleted = await removeDuplicateRoles(prisma as never);

    expect(deleted).toEqual(['user']);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { roleId: 'old-user' },
      data: { roleId: 'sys-user' },
    });
    expect(prisma.userWarehouse.updateMany).toHaveBeenCalledWith({
      where: { roleId: 'old-user' },
      data: { roleId: 'sys-user' },
    });
    expect(prisma.role.delete).toHaveBeenCalledWith({
      where: { id: 'old-user' },
    });
  });

  it('keeps custom roles, including ones only differing in case, and copies whose system role does not exist yet', async () => {
    const prisma = setup([
      { id: 'c', name: 'CAJERO' },
      { id: 'v', name: 'viewer' },
      { id: 'sys-user', name: 'USER' },
      { id: 'mine', name: 'User' },
    ]);

    const deleted = await removeDuplicateRoles(prisma as never);

    expect(deleted).toEqual([]);
    expect(prisma.role.delete).not.toHaveBeenCalled();
  });
});
