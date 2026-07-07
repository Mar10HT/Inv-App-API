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
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { UserRole } from '@prisma/client';
import { WarehouseAccessService } from '../common/warehouse-access/warehouse-access.service';
import { AuditService } from '../audit/audit.service';

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
    private auditService: AuditService,
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
      },
    });

    return token;
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

    // Generate new access token
    const payload = {
      sub: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role,
    };
    const accessToken = this.jwtService.sign(payload);

    const warehouseIds =
      (await this.warehouseAccessService.getAccessibleWarehouseIds(
        storedToken.user.id,
        storedToken.user.role,
      )) ?? [];

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
    };
  }

  /**
   * Revoke a refresh token. Returns the userId of the token's prior owner
   * (or null if the token didn't exist) so callers can audit the LOGOUT
   * attribution in one round-trip instead of fetching beforehand.
   */
  async revokeRefreshToken(token: string): Promise<{ userId: string } | null> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token },
      select: { userId: true },
    });
    if (!stored) return null;
    await this.prisma.refreshToken.update({
      where: { token },
      data: { revoked: true },
    });
    return { userId: stored.userId };
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
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
        .catch((err) =>
          this.logger.error(
            'Failed to send password reset email',
            err?.message,
          ),
        );
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

    this.auditService.logSafe({
      action: 'PASSWORD_CHANGE',
      entity: 'User',
      entityId: resetToken.userId,
      userId: resetToken.userId,
      changes: { after: { email: resetToken.user.email, source: 'reset' } },
    });

    // Send confirmation email
    this.emailService
      .sendPasswordChangedEmail(
        resetToken.user.email,
        resetToken.user.name || undefined,
      )
      .catch((err) =>
        this.logger.error(
          'Failed to send password changed email',
          err?.message,
        ),
      );
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

    this.auditService.logSafe({
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
      changes: { after: { email: user.email, ip } },
    });

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    // Create refresh token (rememberMe will be set from controller)
    const refreshToken = await this.createRefreshToken(
      user.id,
      loginDto.rememberMe,
    );

    const warehouseIds =
      (await this.warehouseAccessService.getAccessibleWarehouseIds(
        user.id,
        user.role,
      )) ?? [];

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

    const payload = {
      sub: newUser.id,
      email: newUser.email,
      role: newUser.role,
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.createRefreshToken(newUser.id);

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

    this.auditService.logSafe({
      action: 'PASSWORD_CHANGE',
      entity: 'User',
      entityId: userId,
      userId,
      changes: { after: { email: user.email, source: 'self' } },
    });

    // Send confirmation email
    this.emailService
      .sendPasswordChangedEmail(user.email, user.name || undefined)
      .catch((err) =>
        this.logger.error(
          'Failed to send password changed email',
          err?.message,
        ),
      );

    return { message: 'Password changed successfully' };
  }
}
