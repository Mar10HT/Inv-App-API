import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantFlagService } from '../tenant/tenant-flag.service';
import { buildTenantExtension } from '../tenant/tenant.extension';

type ExtendedClient = ReturnType<PrismaClient['$extends']>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private extendedClient: ExtendedClient | null = null;

  constructor(
    private readonly tenantFlag: TenantFlagService,
    private readonly tenantContext: TenantContextService,
    private readonly cls: ClsService,
  ) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }

  /**
   * Returns a Prisma client that automatically scopes queries to the orgId in
   * the current CLS context. Use this from services that operate on
   * tenant-scoped data (inventory, warehouses, transactions, etc).
   *
   * For trusted paths (auth, cron, seeds, SUPER_ADMIN cross-org reads), use
   * the base service directly: `prisma.user.findMany()`. Or wrap with
   * `runWithTenantBypass(cls, () => prisma.tenant().inventoryItem.findMany())`
   * when you need a tenant-scoped client but with the filter disabled.
   *
   * The extension itself is a no-op when MULTI_TENANT_ENABLED=false, so this
   * method is safe to call in Phase 2 before the flag flips.
   */
  tenant(): ExtendedClient {
    if (!this.extendedClient) {
      this.extendedClient = this.$extends(
        buildTenantExtension({
          flag: this.tenantFlag,
          ctx: this.tenantContext,
          cls: this.cls,
        }),
      );
    }
    return this.extendedClient;
  }
}
