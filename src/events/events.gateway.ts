import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

interface WsJwtPayload {
  sub: string;
  role: string;
}

@WebSocketGateway({
  cors: {
    origin: (
      origin: string,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      callback(null, true);
    },
    credentials: true,
  },
  namespace: '/ws',
})
export class EventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Client ${client.id} disconnected: no token`);
        client.disconnect();
        return;
      }

      const secret = this.configService.get<string>('JWT_SECRET');
      const payload = this.jwtService.verify<WsJwtPayload>(token, { secret });

      client.userId = payload.sub;
      client.userRole = payload.role;

      // Join user-specific and role-specific rooms
      await client.join(`user:${payload.sub}`);
      await client.join(`role:${payload.role}`);

      this.logger.log(
        `Client connected: ${client.id} (user: ${payload.sub}, role: ${payload.role})`,
      );
    } catch {
      this.logger.warn(`Client ${client.id} disconnected: invalid token`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  private extractToken(client: Socket): string | null {
    // Try cookie first
    const cookies = client.handshake.headers.cookie;
    if (cookies) {
      const tokenCookie = cookies
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('access_token='));
      if (tokenCookie) {
        return tokenCookie.split('=')[1];
      }
    }

    // Try auth header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try auth payload (socket.io client-side `auth` option). `handshake.auth`
    // is typed as an index signature of `any` by socket.io, so narrow it
    // explicitly before trusting it as a token string.
    const authPayload = client.handshake.auth as Record<string, unknown>;
    const token = authPayload.token;
    if (typeof token === 'string' && token) {
      return token;
    }

    return null;
  }
}
