import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedUser } from '../interfaces/auth-user.interface';

type RequestWithUser = Request & { user?: AuthenticatedUser };

/**
 * Decorator to extract the current user from the request
 * @example @CurrentUser() user: AuthenticatedUser
 * @example @CurrentUser('userId') userId: string
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthenticatedUser | undefined,
    ctx: ExecutionContext,
  ): AuthenticatedUser | AuthenticatedUser[keyof AuthenticatedUser] | null => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      return null;
    }

    // If a specific property is requested, return only that property
    return data ? user[data] : user;
  },
);
