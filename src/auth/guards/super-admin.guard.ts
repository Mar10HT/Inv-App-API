import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/auth-user.interface';

/**
 * Platform-level guard for SUPER_ADMIN-only endpoints (organization management,
 * impersonation, cross-tenant analytics). Must be used together with JwtAuthGuard.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('SUPER_ADMIN role required');
    }

    return true;
  }
}
