import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Get,
  UseGuards,
  Request,
  Response,
  Param,
  Ip,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response as ExpressResponse, Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { CsrfService } from '../csrf/csrf.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard, PermissionsGuard } from './guards';
import { Permissions } from './decorators';
import { PermissionsService } from '../permissions/permissions.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly csrfService: CsrfService,
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * Get CSRF token for frontend protection.
   */
  @Get('csrf-token')
  getCsrfToken(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const csrfToken = this.csrfService.generateToken(req, res);
    return { csrfToken };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body(ValidationPipe) loginDto: LoginDto,
    @Response({ passthrough: true }) res: ExpressResponse,
    @Request() req: ExpressRequest,
  ) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const result = await this.authService.login(loginDto, ip);

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction, // Must be true for sameSite: 'none'
      sameSite: isProduction ? 'none' as const : 'strict' as const,
    };

    // Access token cookie (short-lived, 15 min)
    res.cookie('access_token', result.access_token, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    // Refresh token cookie (longer-lived)
    const refreshMaxAge = loginDto.rememberMe
      ? 30 * 24 * 60 * 60 * 1000 // 30 days
      : 7 * 24 * 60 * 60 * 1000; // 7 days

    res.cookie('refresh_token', result.refresh_token, {
      ...cookieOptions,
      maxAge: refreshMaxAge,
      path: '/api/auth', // Only sent to auth endpoints
    });

    return {
      user: result.user,
      expires_in: 900, // 15 minutes in seconds
      // Tokens included for non-cookie clients (mobile apps)
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async register(
    @Body(ValidationPipe) registerDto: RegisterDto,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.authService.register(registerDto);

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'strict' as const,
    };

    res.cookie('access_token', result.access_token, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', result.refresh_token, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    return {
      user: result.user,
      expires_in: 900,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
    @Body() body?: RefreshTokenDto,
  ) {
    // Get refresh token from cookie or body
    const refreshToken = req.cookies?.refresh_token || body?.refresh_token;

    if (!refreshToken) {
      res.status(HttpStatus.UNAUTHORIZED);
      return { message: 'No refresh token provided' };
    }

    const result = await this.authService.refreshAccessToken(refreshToken);

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'strict' as const,
    };

    res.cookie('access_token', result.access_token, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', result.refresh_token, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });

    return {
      user: result.user,
      expires_in: 900,
      // Tokens included for non-cookie clients (mobile apps)
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
    @Body('refresh_token') bodyRefreshToken?: string,
  ) {
    // Accept refresh token from cookie (web) or body (mobile)
    const refreshToken = req.cookies?.refresh_token ?? bodyRefreshToken;
    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken);
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'strict' as const,
    };

    // Clear cookies
    res.clearCookie('access_token', cookieOptions);
    res.clearCookie('refresh_token', { ...cookieOptions, path: '/api/auth' });

    return { message: 'Logged out successfully' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgotPassword(@Body(ValidationPipe) dto: ForgotPasswordDto) {
    const token = await this.authService.createPasswordResetToken(dto.email);

    if (token && process.env.NODE_ENV !== 'production') {
      // Only in development: return token for testing
      return {
        message: 'If an account exists with this email, a reset link has been sent.',
        _dev_token: token,
        _dev_reset_url: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/reset-password/${token}`,
      };
    }

    return {
      message: 'If an account exists with this email, a reset link has been sent.',
    };
  }

  /**
   * Get users with pending (active) password reset tokens.
   * Requires auth:admin — intentionally not assigned to any role.
   * SYSTEM_ADMIN bypasses the check.
   */
  @Get('pending-resets')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('auth:admin')
  async getPendingResets() {
    return this.authService.getPendingResets();
  }

  /**
   * Generate a password reset link for a specific user.
   * Requires auth:admin — intentionally not assigned to any role.
   * SYSTEM_ADMIN bypasses the check.
   */
  @Post('admin/generate-reset-link/:userId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('auth:admin')
  async generateResetLink(@Param('userId') userId: string) {
    // Verify user exists
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const token = await this.authService.createResetTokenForUser(userId);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const resetUrl = `${frontendUrl}/reset-password/${token}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    return {
      resetUrl,
      ...(process.env.NODE_ENV !== 'production' ? { token } : {}),
      expiresAt,
    };
  }

  @Post('reset-password/:token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(
    @Param('token') token: string,
    @Body(ValidationPipe) dto: ResetPasswordDto,
  ) {
    await this.authService.resetPassword(token, dto.newPassword);
    return { message: 'Password has been reset successfully. Please log in with your new password.' };
  }

  /**
   * Returns the authenticated user's profile plus their current permissions.
   * Called on app init and polled every 60s to detect permission changes.
   * Uses getPermissionsWithVersion to resolve both in a single DB round-trip.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req) {
    const userId: string = req.user.userId;
    const [user, { permissions, version: permissionsVersion }] = await Promise.all([
      this.authService.validateUser(userId),
      this.permissionsService.getPermissionsWithVersion(userId),
    ]);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      permissions,
      permissionsVersion,
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req) {
    return this.authService.validateUser(req.user.userId);
  }

  @Post('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Request() req,
    @Body(ValidationPipe) updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(req.user.userId, updateProfileDto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Request() req,
    @Body(ValidationPipe) changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.userId, changePasswordDto);
  }
}
