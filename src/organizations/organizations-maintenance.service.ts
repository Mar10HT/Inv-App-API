import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrganizationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantFlagService } from '../tenant/tenant-flag.service';

/**
 * Background maintenance for the tenant model.
 *
 * Currently revokes refresh tokens bound to non-ACTIVE orgs every 5 minutes.
 * Worst case window: a user can keep using their session for ~5 minutes after
 * their org is suspended. Their access token may stay valid until it expires
 * (15 min), but the refresh will then fail and they will be logged out.
 *
 * If real-time deprovisioning becomes a requirement, replace this poll with
 * an explicit revoke call inside Organization.update when status transitions
 * to SUSPENDED or ARCHIVED.
 */
@Injectable()
export class OrganizationsMaintenanceService {
  private readonly logger = new Logger(OrganizationsMaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flag: TenantFlagService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async revokeTokensForInactiveOrgs(): Promise<void> {
    if (!this.flag.isEnabled()) return;
    return this.runRevokeOnce();
  }

  /**
   * Exposed for direct invocation from tests and from the OrganizationsService
   * itself (when a status transition happens), so revocation isn't tied to the
   * cron tick.
   */
  async runRevokeOnce(): Promise<{ orgsAffected: number; tokensRevoked: number }> {
    const inactiveOrgs = await this.prisma.organization.findMany({
      where: { status: { not: OrganizationStatus.ACTIVE } },
      select: { id: true, status: true, slug: true },
    });

    if (inactiveOrgs.length === 0) {
      return { orgsAffected: 0, tokensRevoked: 0 };
    }

    const result = await this.prisma.refreshToken.updateMany({
      where: {
        organizationId: { in: inactiveOrgs.map((o) => o.id) },
        revoked: false,
      },
      data: { revoked: true },
    });

    if (result.count > 0) {
      const slugs = inactiveOrgs.map((o) => `${o.slug}=${o.status}`).join(', ');
      this.logger.warn(
        `Revoked ${result.count} refresh token(s) bound to inactive orgs: ${slugs}`,
      );
    }

    return { orgsAffected: inactiveOrgs.length, tokensRevoked: result.count };
  }
}
