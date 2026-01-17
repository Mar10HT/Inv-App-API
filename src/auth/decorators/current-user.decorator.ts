import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator to extract the current user from the request
 * @example @CurrentUser() user: AuthUser
 * @example @CurrentUser('userId') userId: string
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    // If a specific property is requested, return only that property
    return data ? user[data] : user;
  },
);
