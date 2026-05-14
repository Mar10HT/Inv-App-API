/**
 * Integration test for the Phase 2 tenant isolation guarantees.
 *
 * Runs against the real Postgres dev DB (obsid_dev). The schema must already
 * be migrated to at least the Phase 1.5 baseline (organizations table, the
 * organizationId NOT NULL columns and the 4 child consistency triggers).
 *
 * To enable from a fresh checkout:
 *   docker exec control-horas-back-db-1 psql -U icn -c 'CREATE DATABASE obsid_dev;'
 *   prisma migrate deploy
 *
 * All rows created here are tagged with a per-suite prefix so that a failed
 * run does not pollute the development data. The afterAll hook cleans up by
 * prefix even if some tests fail.
 */
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ClsModule, ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';
import { TenantFlagService } from './tenant-flag.service';
import { runWithTenantBypass } from './tenant-bypass.helper';

const PREFIX = `iso_${Date.now()}_`;
const orgA = { id: `${PREFIX}orgA`, slug: `${PREFIX}A`, name: 'Org A' };
const orgB = { id: `${PREFIX}orgB`, slug: `${PREFIX}B`, name: 'Org B' };

describe('Tenant isolation (integration)', () => {
  let prisma: PrismaService;
  let cls: ClsService;
  let ctx: TenantContextService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ClsModule.forRoot()],
      providers: [
        PrismaService,
        TenantContextService,
        TenantFlagService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'MULTI_TENANT_ENABLED') return true;
              return undefined;
            },
          },
        },
      ],
    }).compile();

    prisma = module.get(PrismaService);
    cls = module.get(ClsService);
    ctx = module.get(TenantContextService);

    await prisma.$connect();

    // Seed two orgs using the base client (bypasses the tenant filter).
    await prisma.organization.create({
      data: { id: orgA.id, slug: orgA.slug, name: orgA.name, status: 'ACTIVE' },
    });
    await prisma.organization.create({
      data: { id: orgB.id, slug: orgB.slug, name: orgB.name, status: 'ACTIVE' },
    });
  });

  afterAll(async () => {
    // Delete everything we created, in reverse FK order.
    await prisma.inventoryItem.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.warehouse.deleteMany({ where: { name: { startsWith: PREFIX } } });
    await prisma.organization.deleteMany({
      where: { id: { in: [orgA.id, orgB.id] } },
    });
    await prisma.$disconnect();
  });

  const insideOrg = <T>(orgId: string, fn: () => Promise<T>): Promise<T> =>
    cls.run(async () => {
      ctx.setContext({
        orgId,
        userId: `${PREFIX}user`,
        userRole: 'USER',
        orgRole: 'MEMBER',
      });
      return fn();
    });

  it('creates inject organizationId from the active context', async () => {
    await insideOrg(orgA.id, async () => {
      const wh = await prisma.tenant().warehouse.create({
        data: { name: `${PREFIX}warehouseA`, location: 'A' },
      });
      expect(wh.organizationId).toBe(orgA.id);
    });

    await insideOrg(orgB.id, async () => {
      const wh = await prisma.tenant().warehouse.create({
        data: { name: `${PREFIX}warehouseB`, location: 'B' },
      });
      expect(wh.organizationId).toBe(orgB.id);
    });
  });

  it('findMany only returns rows from the active org', async () => {
    await insideOrg(orgA.id, async () => {
      const rows = await prisma.tenant().warehouse.findMany({
        where: { name: { startsWith: PREFIX } },
      });
      expect(rows.map((r) => r.name)).toEqual([`${PREFIX}warehouseA`]);
    });

    await insideOrg(orgB.id, async () => {
      const rows = await prisma.tenant().warehouse.findMany({
        where: { name: { startsWith: PREFIX } },
      });
      expect(rows.map((r) => r.name)).toEqual([`${PREFIX}warehouseB`]);
    });
  });

  it('rejects creating a row in a different org than the context', async () => {
    await insideOrg(orgA.id, async () => {
      await expect(
        prisma.tenant().warehouse.create({
          data: { name: `${PREFIX}stranger`, location: 'X', organizationId: orgB.id },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('rejects updateMany that targets another org', async () => {
    await insideOrg(orgA.id, async () => {
      const result = await prisma.tenant().warehouse.updateMany({
        where: { name: `${PREFIX}warehouseB` },
        data: { location: 'hacked' },
      });
      // updateMany ANDs the org filter, so it matches 0 rows (not an error).
      expect(result.count).toBe(0);
    });
  });

  it('count and aggregate respect the org scope', async () => {
    await insideOrg(orgA.id, async () => {
      const count = await prisma.tenant().warehouse.count({
        where: { name: { startsWith: PREFIX } },
      });
      expect(count).toBe(1);
    });

    await insideOrg(orgB.id, async () => {
      const count = await prisma.tenant().warehouse.count({
        where: { name: { startsWith: PREFIX } },
      });
      expect(count).toBe(1);
    });
  });

  it('runWithTenantBypass disables filtering for cross-org queries (trusted paths)', async () => {
    await insideOrg(orgA.id, async () => {
      // Even though context says org A, bypass lets us see both
      const all = await runWithTenantBypass(cls, () =>
        prisma.tenant().warehouse.findMany({
          where: { name: { startsWith: PREFIX } },
          orderBy: { name: 'asc' },
        }),
      );
      expect(all.map((r) => r.name).sort()).toEqual([
        `${PREFIX}warehouseA`,
        `${PREFIX}warehouseB`,
      ]);
    });
  });

  it('throws when a tenant-scoped query runs without orgId in context', async () => {
    await cls.run(async () => {
      // No context set => no orgId
      ctx.setContext({ userId: `${PREFIX}orphan`, userRole: 'USER' });
      await expect(
        prisma.tenant().warehouse.findMany({ where: { name: { startsWith: PREFIX } } }),
      ).rejects.toThrow(/Tenant context missing/);
    });
  });

  it('attempting to query a foreign org via where merge is rejected', async () => {
    await insideOrg(orgA.id, async () => {
      await expect(
        prisma.tenant().warehouse.findMany({
          where: { organizationId: orgB.id },
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
