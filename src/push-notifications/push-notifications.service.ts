import { Injectable, Logger } from '@nestjs/common';

export interface ExpoPushMessage {
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
const FETCH_TIMEOUT_MS = 10_000;

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  /**
   * Send push notifications in batches of 100 (Expo API limit).
   * Returns an array of stale tokens that reported DeviceNotRegistered
   * so the caller can clean them from the database.
   */
  async send(messages: ExpoPushMessage[]): Promise<string[]> {
    if (messages.length === 0) return [];

    const staleTokens: string[] = [];
    const chunks = this.chunk(messages, 100);

    // Chunks are sent sequentially (not in parallel) to stay within Expo's rate limits.
    // With typical inventory deployments (hundreds of users) this is fast enough.
    for (const chunk of chunks) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(chunk),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!res.ok) {
          this.logger.error(`Expo push API error: ${res.status} ${res.statusText}`);
          continue;
        }

        const json = await res.json();
        if (!Array.isArray(json?.data)) {
          this.logger.error(`Unexpected Expo push API response shape: ${JSON.stringify(json)}`);
          continue;
        }
        const data: ExpoPushTicket[] = json.data;
        data.forEach((ticket, i) => {
          if (ticket.status === 'error') {
            this.logger.warn(`Push ticket error: ${ticket.message} (${ticket.details?.error})`);
            if (ticket.details?.error === 'DeviceNotRegistered') {
              staleTokens.push(chunk[i].to);
            }
          }
        });
      } catch (err) {
        clearTimeout(timeout);
        if ((err as Error).name === 'AbortError') {
          this.logger.error(`Expo push API timed out after ${FETCH_TIMEOUT_MS}ms`);
        } else {
          this.logger.error('Failed to send push notifications', err);
        }
      }
    }

    return staleTokens;
  }

  async sendOne(message: ExpoPushMessage): Promise<string[]> {
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
