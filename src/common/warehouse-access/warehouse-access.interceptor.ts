import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { WarehouseAccessService } from './warehouse-access.service';

/**
 * Global interceptor that resolves warehouseIds for the authenticated user
 * and attaches them to request.user.warehouseIds.
 *
 * Runs after JwtAuthGuard has populated request.user with { userId, email, role }.
 * After this interceptor, request.user becomes { userId, email, role, warehouseIds }.
 */
@Injectable()
export class WarehouseAccessInterceptor implements NestInterceptor {
  constructor(
    private readonly warehouseAccessService: WarehouseAccessService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Only process authenticated requests (user is set by JWT strategy)
    if (user && user.userId) {
      user.warehouseIds =
        await this.warehouseAccessService.getAccessibleWarehouseIds(
          user.userId,
          user.role,
        );
    }

    return next.handle();
  }
}
