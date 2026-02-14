import { Injectable } from '@nestjs/common';
import { doubleCsrf } from 'csrf-csrf';
import type { Request, Response } from 'express';

// Initialize CSRF protection at module level to avoid NestJS constructor issues
// Note: csrf-csrf v4 returns { generateCsrfToken, doubleCsrfProtection, ... }
const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => {
    const secret = process.env.CSRF_SECRET;
    if (!secret) {
      throw new Error('CSRF_SECRET environment variable is required');
    }
    return secret;
  },
  // Use a fixed identifier - CSRF security comes from the double-submit cookie pattern itself,
  // not from binding to IP (which is unreliable behind proxies/load balancers)
  getSessionIdentifier: () => 'csrf-session',
  cookieName: '_csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,
});

@Injectable()
export class CsrfService {
  /**
   * Generate CSRF token for a request
   * This will set the HttpOnly cookie and return the token string
   */
  generateToken(req: Request, res: Response): string {
    return generateCsrfToken(req, res);
  }

  /**
   * Get the CSRF protection middleware
   */
  getProtectionMiddleware() {
    return doubleCsrfProtection;
  }
}
