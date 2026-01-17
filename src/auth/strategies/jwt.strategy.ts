import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '../../users/users.service';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: string;
}

// Custom extractor that tries cookie first, then Bearer token
const extractJwtFromCookieOrBearer = (req: Request): string | null => {
  // Try to extract from HttpOnly cookie first
  if (req.cookies && req.cookies.access_token) {
    return req.cookies.access_token;
  }
  // Fall back to Bearer token in Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set. Please configure it in your .env file.');
    }
    super({
      jwtFromRequest: extractJwtFromCookieOrBearer,
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersService.findOne(payload.sub);

    if (!user) {
      throw new UnauthorizedException();
    }

    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
