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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'crypto';
import type { Response as ExpressResponse, Request as ExpressRequest } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Get CSRF token for frontend protection.
   */
  @Get('csrf-token')
  getCsrfToken(@Response({ passthrough: true }) res: ExpressResponse) {
    const token = randomBytes(32).toString('hex');
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('XSRF-TOKEN', token, {
      httpOnly: false, // Must be readable by JavaScript
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'strict' as const,
      maxAge: 24 * 60 * 60 * 1000,
    });

    return { csrfToken: token };
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

    console.log(`[Auth] Login success for ${loginDto.email}, setting cookies with:`, {
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      NODE_ENV: process.env.NODE_ENV,
    });

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
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Request() req: ExpressRequest,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    // Revoke refresh token if present
    const refreshToken = req.cookies?.refresh_token;
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

  /**
   * Debug endpoint to check cookie reception (remove in production)
   */
  @Get('debug-cookies')
  debugCookies(@Request() req: ExpressRequest) {
    return {
      hasCookies: !!req.cookies,
      hasAccessToken: !!req.cookies?.access_token,
      hasRefreshToken: !!req.cookies?.refresh_token,
      cookieNames: req.cookies ? Object.keys(req.cookies) : [],
      NODE_ENV: process.env.NODE_ENV,
    };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgotPassword(@Body(ValidationPipe) dto: ForgotPasswordDto) {
    const token = await this.authService.createPasswordResetToken(dto.email);

    // TODO: Send email with reset link
    // For now, we return a generic message (don't reveal if email exists)
    // In production, integrate with email service

    if (token && process.env.NODE_ENV !== 'production') {
      // Only in development: return token for testing
      return {
        message: 'If an account exists with this email, a reset link has been sent.',
        // DEV ONLY - remove in production
        _dev_token: token,
        _dev_reset_url: `${process.env.FRONTEND_URL || 'http://localhost:4200'}/reset-password/${token}`,
      };
    }

    return {
      message: 'If an account exists with this email, a reset link has been sent.',
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
