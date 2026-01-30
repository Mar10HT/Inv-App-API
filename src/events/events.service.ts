import { Injectable } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

export interface EventPayload {
  entity: string;
  action: 'created' | 'updated' | 'deleted' | 'bulk_updated' | 'bulk_deleted' | 'imported';
  entityId?: string;
  data?: any;
}

@Injectable()
export class EventsService {
  constructor(private gateway: EventsGateway) {}

  broadcast(event: string, payload: EventPayload): void {
    this.gateway.server?.emit(event, payload);
  }

  sendToUser(userId: string, event: string, payload: EventPayload): void {
    this.gateway.server?.to(`user:${userId}`).emit(event, payload);
  }

  sendToRole(role: string, event: string, payload: EventPayload): void {
    this.gateway.server?.to(`role:${role}`).emit(event, payload);
  }

  // Convenience methods for common events
  emitInventoryChange(action: EventPayload['action'], entityId?: string, data?: any): void {
    this.broadcast('inventory:change', {
      entity: 'inventory',
      action,
      entityId,
      data,
    });
  }

  emitLoanChange(action: EventPayload['action'], entityId?: string, data?: any): void {
    this.broadcast('loan:change', {
      entity: 'loan',
      action,
      entityId,
      data,
    });
  }

  emitTransactionChange(action: EventPayload['action'], entityId?: string, data?: any): void {
    this.broadcast('transaction:change', {
      entity: 'transaction',
      action,
      entityId,
      data,
    });
  }
}
