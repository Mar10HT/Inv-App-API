import { Injectable } from '@nestjs/common';
import { doubleCsrf } from 'csrf-csrf';
import type { Request, Response } from 'express';

// Initialize CSRF protection at module level to avoid NestJS constructor issues
// Note: csrf-csrf v4 returns { generateCsrfToken, doubleCsrfProtection, ... }
const {
  generateCsrfToken,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'your-csrf-secret-change-in-production',
  // For stateless JWT auth, use IP as session identifier
  getSessionIdentifier: (req) => req.ip || req.socket.remoteAddress || 'unknown',
  cookieName: '_csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getTokenFromRequest: (req) => req.headers['x-csrf-token'] as string,
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
