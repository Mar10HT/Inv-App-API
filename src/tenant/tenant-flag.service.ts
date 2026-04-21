import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TenantFlagService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const raw = this.config.get<unknown>('MULTI_TENANT_ENABLED');
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') return raw.toLowerCase() === 'true';
    return false;
  }

  assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Multi-tenant mode is disabled');
    }
  }
}
