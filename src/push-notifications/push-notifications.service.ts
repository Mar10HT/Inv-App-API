import { Injectable, Logger } from '@nestjs/common';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  async send(messages: ExpoPushMessage[]): Promise<void> {
    if (messages.length === 0) return;

    // Expo accepts up to 100 messages per request
    const chunks = this.chunk(messages, 100);

    for (const chunk of chunks) {
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(chunk),
        });

        if (!res.ok) {
          this.logger.error(`Expo push API error: ${res.status} ${res.statusText}`);
          continue;
        }

        const { data }: { data: ExpoPushTicket[] } = await res.json();
        for (const ticket of data) {
          if (ticket.status === 'error') {
            this.logger.warn(`Push ticket error: ${ticket.message} (${ticket.details?.error})`);
          }
        }
      } catch (err) {
        this.logger.error('Failed to send push notifications', err);
      }
    }
  }

  async sendOne(message: ExpoPushMessage): Promise<void> {
    return this.send([message]);
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
