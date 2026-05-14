import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { UserRole, OrganizationStatus } from '@prisma/client';
import { WarehouseAccessService } from '../common/warehouse-access/warehouse-access.service';

interface AvailableOrg {
  id: string;
  slug: string;
  name: string;
  orgRole: 'OWNER' | 'ORG_ADMIN' | 'MEMBER' | 'EXTERNAL';
}

interface AuthContext {
  payload: JwtPayload;
  availableOrgs: AvailableOrg[] | null; // non-null only when user has 2+ ACTIVE orgs
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Account lockout settings
  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  private readonly REFRESH_TOKEN_EXPIRY_DAYS = 7;
  private readonly REFRESH_TOKEN_EXPIRY_REMEMBER_DAYS = 30;
  private readonly PASSWORD_RESET_EXPIRY_HOURS = 1;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
    private emailService: EmailService,
    private warehouseAccessService: WarehouseAccessService,
  ) {}

  // ============================================
  // Account Lockout Methods
  // ============================================

  async checkAccountLockout(email: string): Promise<void> {
    const lockoutTime = new Date(Date.now() - this.LOCKOUT_DURATION_MS);

    const recentFailedAttempts = await this.prisma.loginAttempt.count({
      where: {
        email: email.toLowerCase(),
        success: false,
        createdAt: { gte: lockoutTime },
      },
    });

    if (recentFailedAttempts >= this.MAX_LOGIN_ATTEMPTS) {
      // Find the oldest attempt within the lockout window to compute actual remaining time
      const oldestAttempt = await this.prisma.loginAttempt.findFirst({
        where: {
          email: email.toLowerCase(),
          success: false,
          createdAt: { gte: lockoutTime },
        },
        orderBy: { createdAt: 'asc' },
      });

      const unlockAtMs = oldestAttempt
        ? oldestAttempt.createdAt.getTime() + this.LOCKOUT_DURATION_MS
        : Date.now() + this.LOCKOUT_DURATION_MS;

      const remainingMinutes = Math.ceil((unlockAtMs - Date.now()) / 60000);
      throw new ForbiddenException(
        `Account temporarily locked due to too many failed attempts. Try again in ${remainingMinutes} minutes.`,
      );
    }
  }

  async recordLoginAttempt(
    email: string,
    ip: string,
    success: boolean,
  ): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        email: email.toLowerCase(),
        ip,
        success,
      },
    });

    // Clean up old attempts (older than 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.prisma.loginAttempt.deleteMany({
      where: { createdAt: { lt: oneDayAgo } },
    });
  }

  // ============================================
  // Refresh Token Methods
  // ============================================

  async createRefreshToken(
    userId: string,
    rememberMe = false,
    organizationId?: string,
  ): Promise<string> {
    const token = randomBytes(64).toString('hex');
    const expiryDays = rememberMe
      ? this.REFRESH_TOKEN_EXPIRY_REMEMBER_DAYS
      : this.REFRESH_TOKEN_EXPIRY_DAYS;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
        ...(organizationId ? { organizationId } : {}),
      },
    });

    return token;
  }

  /**
   * Build the JWT payload and the available-orgs list for a user.
   *
   * Multi-tenant rules:
   * - SUPER_ADMIN: payload has no orgId/orgRole. Impersonation happens via the
   *   X-Org-Id header at request time, not via the token.
   * - User with 0 ACTIVE orgs: same as SUPER_ADMIN at the payload level (no org
   *   info). The interceptor will block any tenant-scoped route. Edge case kept
   *   defensive; Phase 1 backfill maps everyone to org_on, so this shouldn't
   *   happen in practice.
   * - User with exactly 1 ACTIVE org: orgId + orgRole baked into the token.
   * - User with 2+ ACTIVE orgs: payload has NO orgId. Caller returns the list
   *   to the client so the UI shows a picker; client then exchanges the
   *   org-less token for an org-bound one via POST /auth/switch-org.
   */
  async buildAuthContext(user: { id: string; email: string; role: string }): Promise<AuthContext> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    if (user.role === UserRole.SUPER_ADMIN) {
      return { payload, availableOrgs: null };
    }

    const memberships = await this.prisma.userOrganization.findMany({
      where: { userId: user.id },
      include: {
        organization: { select: { id: true, slug: true, name: true, status: true } },
      },
    });

    const active = memberships.filter(
      (m) => m.organization.status === OrganizationStatus.ACTIVE,
    );

    if (active.length === 0) {
      return { payload, availableOrgs: null };
    }

    if (active.length === 1) {
      payload.orgId = active[0].organizationId;
      payload.orgRole = active[0].orgRole;
      return { payload, availableOrgs: null };
    }

    const availableOrgs: AvailableOrg[] = active.map((m) => ({
      id: m.organization.id,
      slug: m.organization.slug,
      name: m.organization.name,
      orgRole: m.orgRole,
    }));
    return { payload, availableOrgs };
  }

  async refreshAccessToken(refreshToken: string) {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.revoked) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Rotate the refresh token atomically (revoke old, create new)
    const newRefreshTokenValue = randomBytes(64).toString('hex');
    const expiresAt = new Date(
      Date.now() + this.REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    const { newToken } = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: storedToken.id },
        data: { revoked: true },
      });

      const newToken = await tx.refreshToken.create({
        data: {
          token: newRefreshTokenValue,
          userId: storedToken.userId,
          expiresAt,
        },
      });

      return { newToken };
    });

    const newRefreshToken = newToken.token;

    // Generate new access token. Refresh keeps the original org binding (or
    // returns an org-less token for users who now have multiple orgs since
    // last refresh). switch-org is the explicit way to change orgs.
    const { payload, availableOrgs } = await this.buildAuthContext({
      id: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
    });
    const accessToken = this.jwtService.sign(payload);

    const warehouseIds = await this.warehouseAccessService.getAccessibleWarehouseIds(storedToken.user.id, storedToken.user.role) ?? [];

    return {
      access_token: accessToken,
      refresh_token: newRefreshToken,
      user: {
        id: storedToken.user.id,
        email: storedToken.user.email,
        name: storedToken.user.name,
        role: storedToken.user.role,
        warehouseIds,
        permissionsVersion: storedToken.user.permissionsVersion,
      },
      availableOrgs,
    };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token },
      data: { revoked: true },
    });
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  /**
   * Exchange the current session for one bound to a different organization.
   *
   * Requirements:
   * - The user must have an active UserOrganization for the target org.
   * - The target org must be ACTIVE (not SUSPENDED/ARCHIVED).
   *
   * Effects:
   * - Revokes the current refresh token (passed as argument, typically from
   *   cookie or body) to prevent token reuse with the old org binding.
   * - Mints a new refresh token bound to (userId, targetOrgId).
   * - Mints a new access token with orgId + orgRole set to the target.
   */
  async switchOrg(
    userId: string,
    targetOrgId: string,
    currentRefreshToken: string | undefined,
    rememberMe = false,
  ) {
    // Load membership + target org status in one query
    const membership = await this.prisma.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId: targetOrgId } },
      include: {
        organization: { select: { id: true, slug: true, name: true, status: true } },
        user: { select: { id: true, email: true, name: true, role: true, permissionsVersion: true } },
      },
    });

    if (!membership) {
      throw new ForbiddenException(`You are not a member of organization "${targetOrgId}"`);
    }

    if (membership.organization.status !== OrganizationStatus.ACTIVE) {
      throw new ForbiddenException(
        `Organization "${targetOrgId}" is ${membership.organization.status.toLowerCase()}`,
      );
    }

    const user = membership.user;

    // Revoke the current refresh token so it can't be reused against the old
    // org. We do this BEFORE minting the new one so that if the new mint
    // fails, the old token is still revoked (fail-closed).
    if (currentRefreshToken) {
      await this.revokeRefreshToken(currentRefreshToken);
    }

    // Mint new access token with org binding
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: membership.organizationId,
      orgRole: membership.orgRole,
    };
    const accessToken = this.jwtService.sign(payload);

    // Mint new refresh token bound to the target org
    const refreshToken = await this.createRefreshToken(
      user.id,
      rememberMe,
      membership.organizationId,
    );

    const warehouseIds =
      (await this.warehouseAccessService.getAccessibleWarehouseIds(user.id, user.role)) ?? [];

    this.logger.log(
      `Org switch: user=${user.email} from=<prev> to=${membership.organization.slug} (${targetOrgId})`,
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        warehouseIds,
        permissionsVersion: user.permissionsVersion,
      },
      organization: {
        id: membership.organization.id,
        slug: membership.organization.slug,
        name: membership.organization.name,
      },
      orgRole: membership.orgRole,
    };
  }

  // ============================================
  // Password Reset Methods
  // ============================================

  async createPasswordResetToken(email: string): Promise<string | null> {
    const user = await this.usersService.findByEmail(email);

    // Don't reveal if user exists or not (security)
    if (!user) {
      return null;
    }

    return this.createResetTokenForUser(user.id);
  }

  /**
   * Creates a reset token for a specific user (used by admin flow).
   */
  async createResetTokenForUser(userId: string): Promise<string> {
    // Invalidate any existing reset tokens
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, used: false },
      data: { used: true },
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + this.PASSWORD_RESET_EXPIRY_HOURS * 60 * 60 * 1000,
    );

    await this.prisma.passwordResetToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });

    // Send password reset email (don't await to not slow down response)
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      this.emailService
        .sendPasswordResetEmail(user.email, token, user.name || undefined)
        .catch((err) => this.logger.error('Failed to send password reset email', err?.message));
    }

    return token;
  }

  /**
   * Returns users with active (non-expired, non-used) password reset tokens.
   */
  async getPendingResets() {
    const now = new Date();
    const tokens = await this.prisma.passwordResetToken.findMany({
      where: {
        used: false,
        expiresAt: { gt: now },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    return tokens.map((t) => ({
      userId: t.user.id,
      userName: t.user.name,
      userEmail: t.user.email,
      token: t.token,
      resetUrl: `${frontendUrl}/reset-password/${t.token}`,
      createdAt: t.createdAt,
      expiresAt: t.expiresAt,
    }));
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (resetToken.used) {
      throw new BadRequestException('This reset token has already been used');
    }

    if (resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    // Hash password before the transaction to keep the transaction short
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Atomically: update password, mark token used, and revoke refresh tokens.
    // If any step fails, all are rolled back — preventing partial state (e.g.,
    // token marked used but refresh tokens still alive).
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      });

      await tx.refreshToken.updateMany({
        where: { userId: resetToken.userId, revoked: false },
        data: { revoked: true },
      });
    });

    // Send confirmation email
    this.emailService
      .sendPasswordChangedEmail(
        resetToken.user.email,
        resetToken.user.name || undefined,
      )
      .catch((err) => this.logger.error('Failed to send password changed email', err?.message));
  }

  // ============================================
  // Core Auth Methods
  // ============================================

  async login(loginDto: LoginDto, ip = 'unknown') {
    // Check for account lockout first
    await this.checkAccountLockout(loginDto.email);

    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) {
      await this.recordLoginAttempt(loginDto.email, ip, false);
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      await this.recordLoginAttempt(loginDto.email, ip, false);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Record successful login
    await this.recordLoginAttempt(loginDto.email, ip, true);

    const { payload, availableOrgs } = await this.buildAuthContext(user);
    const accessToken = this.jwtService.sign(payload);

    // Refresh token is bound to (userId, orgId). For multi-org users it is
    // null until /auth/switch-org mints an org-bound one.
    const refreshToken = await this.createRefreshToken(
      user.id,
      loginDto.rememberMe,
      payload.orgId,
    );

    const warehouseIds = await this.warehouseAccessService.getAccessibleWarehouseIds(user.id, user.role) ?? [];

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        warehouseIds,
        permissionsVersion: user.permissionsVersion,
      },
      availableOrgs,
    };
  }

  async register(registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Create user with default USER role
    const newUser = await this.usersService.create({
      ...registerDto,
      role: UserRole.USER,
    });

    // Phase 2: a freshly registered user has no org membership yet. Phase 3
    // will add the UsersService.create flow that wires UserOrganization too.
    // Until then, the payload has no orgId and the user gets an org-less
    // token; with MULTI_TENANT_ENABLED=false this is fine.
    const { payload } = await this.buildAuthContext(newUser);
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.createRefreshToken(newUser.id, false, payload.orgId);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: newUser,
    };
  }

  async validateUser(userId: string) {
    return this.usersService.findOne(userId);
  }

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    // Check if email is already in use by another user
    if (updateProfileDto.email) {
      const existingUser = await this.usersService.findByEmail(
        updateProfileDto.email,
      );
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Email is already in use');
      }
    }

    // Update user profile
    const updatedUser = await this.usersService.update(userId, {
      name: updateProfileDto.name,
      email: updateProfileDto.email,
    });

    return {
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
      },
    };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.usersService.findOneWithPassword(userId);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      changePasswordDto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Check that new password is different from current
    const isSamePassword = await bcrypt.compare(
      changePasswordDto.newPassword,
      user.password,
    );

    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    // Hash and update the new password
    const hashedPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);
    await this.usersService.updatePassword(userId, hashedPassword);

    // Revoke all refresh tokens for security
    await this.revokeAllUserRefreshTokens(userId);

    // Send confirmation email
    this.emailService
      .sendPasswordChangedEmail(user.email, user.name || undefined)
      .catch((err) => this.logger.error('Failed to send password changed email', err?.message));

    return { message: 'Password changed successfully' };
  }
}
