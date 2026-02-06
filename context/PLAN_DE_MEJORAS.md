# Plan de Mejoras - Sistema de Inventario

> **Fecha de análisis:** 16 de Enero 2026
> **Última actualización:** 23 de Enero 2026
> **Versión:** 1.2
> **Proyectos:** Inv-App (Angular 20) + Inv-App-API (NestJS)

---

## Estado Actual del Proyecto

| Fase | Estado | Progreso |
|------|--------|----------|
| Fase 1: Seguridad | **COMPLETADA** | 100% |
| Fase 2: Estabilidad | **COMPLETADA** | 100% |
| Fase 3: Funcionalidades | **COMPLETADA** | 100% |
| Fase 4: Optimización | **COMPLETADA** | 100% |
| Fase 5: Producción | **COMPLETADA** | 100% |
| Fase 6: Avanzadas | PENDIENTE | 0% |

---

## Resumen Ejecutivo

El sistema de inventario tiene una arquitectura sólida y moderna, pero presenta **vulnerabilidades de seguridad críticas** y carece de funcionalidades importantes para un sistema de inventario empresarial. Este documento detalla el plan de acción priorizado.

---

## Problemas Críticos

| # | Problema | Riesgo | Archivo |
|---|----------|--------|---------|
| 1 | Sin control de roles (RBAC) | **CRÍTICO** | Todos los controllers |
| 2 | JWT Secret con fallback hardcodeado | **CRÍTICO** | `auth.module.ts:17` |
| 3 | Sin rate limiting | **ALTO** | Backend completo |
| 4 | Token almacenado en localStorage | **ALTO** | `auth.service.ts:44-46` |
| 5 | Cambio de contraseña no implementado | **ALTO** | `change-password-dialog.ts:148` |
| 6 | SQL Raw inseguro | **ALTO** | `prisma.service.ts:19-25` |

---

## Fase 1: Seguridad (Semanas 1-2)

### 1.1 Implementar Role-Based Access Control (RBAC)

**Prioridad:** CRÍTICA
**Esfuerzo:** 2-3 días

#### Tareas:
- [ ] Crear `RolesGuard` en backend
- [ ] Crear decorador `@Roles()`
- [ ] Crear decorador `@CurrentUser()`
- [ ] Aplicar guards a todos los controllers
- [ ] Definir matriz de permisos por rol

#### Archivos a crear:
```
src/auth/guards/roles.guard.ts
src/auth/decorators/roles.decorator.ts
src/auth/decorators/current-user.decorator.ts
```

#### Matriz de permisos sugerida:
| Acción | SYSTEM_ADMIN | WAREHOUSE_MANAGER | USER | VIEWER | EXTERNAL |
|--------|--------------|-------------------|------|--------|----------|
| Ver inventario | ✅ | ✅ | ✅ | ✅ | ✅ |
| Crear items | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar items | ✅ | ✅ | ✅ | ❌ | ❌ |
| Eliminar items | ✅ | ✅ | ❌ | ❌ | ❌ |
| Gestionar usuarios | ✅ | ❌ | ❌ | ❌ | ❌ |
| Gestionar warehouses | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver reportes | ✅ | ✅ | ✅ | ✅ | ❌ |
| Crear préstamos | ✅ | ✅ | ✅ | ❌ | ❌ |

---

### 1.2 Eliminar JWT Secret Hardcodeado

**Prioridad:** CRÍTICA
**Esfuerzo:** 1 hora

#### Cambios requeridos:

**Archivo:** `src/auth/auth.module.ts`
```typescript
// ANTES (INSEGURO)
secret: configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production'

// DESPUÉS (SEGURO)
secret: configService.getOrThrow<string>('JWT_SECRET')
```

**Archivo:** `src/auth/strategies/jwt.strategy.ts`
```typescript
// Mismo cambio
```

---

### 1.3 Agregar Rate Limiting

**Prioridad:** ALTA
**Esfuerzo:** 2-3 horas

#### Instalación:
```bash
npm install @nestjs/throttler
```

#### Configuración en `app.module.ts`:
```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,    // 1 minuto
      limit: 100,    // 100 requests por minuto (general)
    }]),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
```

#### Rate limits específicos para auth:
```typescript
// En auth.controller.ts
@Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 intentos por minuto
@Post('login')
async login() { ... }
```

---

### 1.4 Migrar Tokens a HttpOnly Cookies

**Prioridad:** ALTA
**Esfuerzo:** 1 día

#### Backend - Cambios en `auth.controller.ts`:
```typescript
@Post('login')
async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
  const result = await this.authService.login(dto);

  res.cookie('access_token', result.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
  });

  return { user: result.user };
}

@Post('logout')
async logout(@Res({ passthrough: true }) res: Response) {
  res.clearCookie('access_token');
  return { message: 'Logged out' };
}
```

#### Frontend - Cambios en `auth.service.ts`:
- Eliminar almacenamiento de token en localStorage
- Configurar HttpClient con `withCredentials: true`

---

### 1.5 Implementar Cambio de Contraseña

**Prioridad:** ALTA
**Esfuerzo:** 4-6 horas

#### Backend - Crear endpoint:
```typescript
// auth.controller.ts
@Patch('change-password')
@UseGuards(JwtAuthGuard)
async changePassword(
  @CurrentUser() user: User,
  @Body() dto: ChangePasswordDto
) {
  return this.authService.changePassword(user.id, dto);
}
```

#### DTO:
```typescript
export class ChangePasswordDto {
  @IsString()
  @MinLength(6)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain uppercase, lowercase and number'
  })
  newPassword: string;
}
```

---

### 1.6 Eliminar SQL Raw Inseguro

**Prioridad:** ALTA
**Esfuerzo:** 1 hora

#### Archivo: `src/prisma/prisma.service.ts`

```typescript
// ANTES (INSEGURO)
async cleanDatabase() {
  const tables = await this.$queryRaw<Array<{ name: string }>>`...`;
  for (const { name } of tables) {
    await this.$executeRawUnsafe(`DELETE FROM "${name}";`);
  }
}

// DESPUÉS (SEGURO)
async cleanDatabase() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Cannot clean database in production');
  }

  // Usar transacciones de Prisma en orden correcto
  await this.$transaction([
    this.loan.deleteMany(),
    this.transactionItem.deleteMany(),
    this.transaction.deleteMany(),
    this.auditLog.deleteMany(),
    this.inventoryItem.deleteMany(),
    this.category.deleteMany(),
    this.supplier.deleteMany(),
    this.warehouse.deleteMany(),
    this.user.deleteMany(),
  ]);
}
```

---

## Fase 2: Estabilidad (Semanas 3-5)

### 2.1 Agregar Paginación a Todos los Endpoints

**Esfuerzo:** 1-2 días

#### Endpoints afectados:
- [ ] `GET /transactions`
- [ ] `GET /loans`
- [ ] `GET /suppliers`
- [ ] `GET /users`
- [ ] `GET /warehouses`
- [ ] `GET /categories`

#### DTO de paginación estándar:
```typescript
export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

export class PaginatedResponseDto<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
```

---

### 2.2 Implementar Sistema de Logging

**Esfuerzo:** 4-6 horas

#### Instalación:
```bash
npm install @nestjs/common winston nest-winston
```

#### Configuración:
```typescript
// logger.config.ts
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

export const loggerConfig = WinstonModule.forRoot({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});
```

---

### 2.3 Crear Error Interceptor Global

**Esfuerzo:** 2-3 horas

```typescript
// src/interceptors/error.interceptor.ts
@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError(error => {
        const request = context.switchToHttp().getRequest();

        this.logger.error({
          message: error.message,
          stack: error.stack,
          path: request.url,
          method: request.method,
          userId: request.user?.id,
        });

        throw error;
      }),
    );
  }
}
```

---

### 2.4 Implementar AuditLog Real

**Esfuerzo:** 1 día

#### Crear AuditService:
```typescript
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    entity: string;
    entityId: string;
    userId: string;
    changes?: Record<string, { old: any; new: any }>;
  }) {
    return this.prisma.auditLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        userId: params.userId,
        changes: params.changes,
      },
    });
  }
}
```

#### Usar en servicios:
```typescript
// inventory.service.ts
async update(id: string, dto: UpdateInventoryDto, userId: string) {
  const oldItem = await this.findOne(id);
  const newItem = await this.prisma.inventoryItem.update({ ... });

  await this.auditService.log({
    action: 'UPDATE',
    entity: 'InventoryItem',
    entityId: id,
    userId,
    changes: this.getChanges(oldItem, newItem),
  });

  return newItem;
}
```

---

### 2.5 Agregar Tests Unitarios

**Esfuerzo:** 3-5 días

#### Archivos prioritarios a testear:
1. `auth.service.ts` - Login, registro, validación
2. `inventory.service.ts` - CRUD, filtros, stats
3. `loans.service.ts` - Crear, devolver, vencidos
4. `transactions.service.ts` - Transferencias, cantidades

#### Estructura de tests:
```
src/
├── auth/
│   ├── auth.service.ts
│   └── auth.service.spec.ts    ← CREAR
├── inventory/
│   ├── inventory.service.ts
│   └── inventory.service.spec.ts    ← CREAR
```

#### Ejemplo de test:
```typescript
describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should return token for valid credentials', async () => {
      // ...
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      // ...
    });
  });
});
```

---

## Fase 3: Funcionalidades (Semanas 6-9)

### 3.1 Operaciones en Lote

**Esfuerzo:** 2-3 días

#### Endpoints a crear:
```typescript
// inventory.controller.ts
@Post('bulk-update')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
async bulkUpdate(@Body() dto: BulkUpdateDto) { ... }

@Delete('bulk-delete')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SYSTEM_ADMIN')
async bulkDelete(@Body() dto: BulkDeleteDto) { ... }

@Post('bulk-import')
@UseInterceptors(FileInterceptor('file'))
async bulkImport(@UploadedFile() file: Express.Multer.File) { ... }
```

---

### 3.2 Sistema de Alertas de Stock Bajo

**Esfuerzo:** 2 días

#### Modelo de alerta:
```prisma
model StockAlert {
  id          String   @id @default(cuid())
  itemId      String
  type        AlertType
  threshold   Int
  currentQty  Int
  notified    Boolean  @default(false)
  notifiedAt  DateTime?
  createdAt   DateTime @default(now())

  item        InventoryItem @relation(fields: [itemId], references: [id])
}

enum AlertType {
  LOW_STOCK
  OUT_OF_STOCK
  EXPIRING_SOON
}
```

#### Servicio de alertas:
```typescript
@Injectable()
export class AlertService {
  @Cron('0 */6 * * *') // Cada 6 horas
  async checkLowStock() {
    const lowStockItems = await this.prisma.inventoryItem.findMany({
      where: {
        quantity: { lte: this.prisma.inventoryItem.fields.minQuantity }
      }
    });

    for (const item of lowStockItems) {
      await this.createAlert(item, 'LOW_STOCK');
      await this.notifyUsers(item);
    }
  }
}
```

---

### 3.3 Workflow de Aprobación para Transferencias

**Esfuerzo:** 3-4 días

#### Nuevo modelo:
```prisma
model TransferRequest {
  id                     String        @id @default(cuid())
  status                 RequestStatus @default(PENDING)
  sourceWarehouseId      String
  destinationWarehouseId String
  requestedById          String
  approvedById           String?
  approvedAt             DateTime?
  rejectedReason         String?
  items                  TransferRequestItem[]
  createdAt              DateTime      @default(now())
}

enum RequestStatus {
  PENDING
  APPROVED
  REJECTED
  COMPLETED
}
```

---

### 3.4 Exportación Excel/PDF

**Esfuerzo:** 2 días

#### Instalación:
```bash
npm install exceljs pdfkit
```

#### Endpoints:
```typescript
@Get('export/excel')
async exportExcel(@Query() filters: FilterDto, @Res() res: Response) {
  const buffer = await this.reportService.generateExcel(filters);
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename=inventory.xlsx',
  });
  res.send(buffer);
}

@Get('export/pdf')
async exportPdf(@Query() filters: FilterDto, @Res() res: Response) {
  const buffer = await this.reportService.generatePdf(filters);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename=inventory.pdf',
  });
  res.send(buffer);
}
```

---

### 3.5 Reconciliación de Inventario

**Esfuerzo:** 3-4 días

#### Modelo:
```prisma
model StockTake {
  id            String          @id @default(cuid())
  warehouseId   String
  status        StockTakeStatus @default(IN_PROGRESS)
  startedAt     DateTime        @default(now())
  completedAt   DateTime?
  completedById String?
  items         StockTakeItem[]
}

model StockTakeItem {
  id            String    @id @default(cuid())
  stockTakeId   String
  itemId        String
  expectedQty   Int
  countedQty    Int?
  variance      Int?
  notes         String?
}
```

---

## Fase 4: Optimización (Semanas 10-11)

### 4.1 Lazy Loading de Librerías Pesadas

**Frontend - Cargar ApexCharts dinámicamente:**
```typescript
// dashboard.ts
async loadCharts() {
  const { default: ApexCharts } = await import('apexcharts');
  // usar ApexCharts
}
```

---

### 4.2 Agregar Índices de BD Faltantes

```prisma
model InventoryItem {
  // ... campos existentes

  @@index([createdAt])
  @@index([warehouseId, category])
  @@index([name])
  @@index([status, warehouseId])
}

model AuditLog {
  // ... campos existentes

  @@index([createdAt])
  @@index([entity, entityId])
  @@index([userId, createdAt])
}
```

---

### 4.3 Implementar Caching

```typescript
// Instalar
npm install @nestjs/cache-manager cache-manager

// Configurar
@Module({
  imports: [
    CacheModule.register({
      ttl: 300, // 5 minutos
      max: 100, // máximo 100 items en cache
    }),
  ],
})

// Usar
@Injectable()
export class InventoryService {
  constructor(@Inject(CACHE_MANAGER) private cache: Cache) {}

  async getCategories() {
    const cached = await this.cache.get('categories');
    if (cached) return cached;

    const categories = await this.prisma.category.findMany();
    await this.cache.set('categories', categories, 300);
    return categories;
  }
}
```

---

### 4.4 Optimizar Queries N+1

**Antes (N+1):**
```typescript
const items = await this.prisma.inventoryItem.findMany();
for (const item of items) {
  const warehouse = await this.prisma.warehouse.findUnique({
    where: { id: item.warehouseId }
  });
}
```

**Después (Optimizado):**
```typescript
const items = await this.prisma.inventoryItem.findMany({
  include: { warehouse: true }
});
```

---

## Fase 5: Producción (Semanas 12-14)

### 5.1 Servicio de Email

**Prioridad:** CRÍTICA
**Esfuerzo:** 1-2 días

#### Instalación:
```bash
npm install @nestjs-modules/mailer nodemailer
npm install --save-dev @types/nodemailer
```

#### Configuración:
```typescript
// mail.module.ts
import { MailerModule } from '@nestjs-modules/mailer';

@Module({
  imports: [
    MailerModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get('MAIL_HOST'),
          port: config.get('MAIL_PORT'),
          auth: {
            user: config.get('MAIL_USER'),
            pass: config.get('MAIL_PASS'),
          },
        },
        defaults: {
          from: '"Inventory System" <noreply@inventory.com>',
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class MailModule {}
```

#### Casos de uso:
- Verificación de email en registro
- Reseteo de contraseña
- Alertas de stock bajo
- Notificaciones de préstamos vencidos

---

### 5.2 Flujo de Reseteo de Contraseña

**Prioridad:** CRÍTICA
**Esfuerzo:** 4-6 horas

#### Endpoints a crear:
```typescript
// auth.controller.ts
@Post('forgot-password')
@Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 intentos por minuto
async forgotPassword(@Body() dto: ForgotPasswordDto) {
  return this.authService.forgotPassword(dto.email);
}

@Post('reset-password/:token')
async resetPassword(
  @Param('token') token: string,
  @Body() dto: ResetPasswordDto,
) {
  return this.authService.resetPassword(token, dto.newPassword);
}
```

#### DTO:
```typescript
export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(12)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).*$/)
  newPassword: string;
}
```

#### Modelo Prisma:
```prisma
model PasswordResetToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  used      Boolean  @default(false)
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@map("password_reset_tokens")
}
```

---

### 5.3 Refresh Tokens

**Prioridad:** ALTA
**Esfuerzo:** 1 día

#### Modelo Prisma:
```prisma
model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  revoked   Boolean  @default(false)
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@map("refresh_tokens")
}
```

#### Implementación:
```typescript
// auth.service.ts
async login(dto: LoginDto) {
  // ... validación existente

  const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
  const refreshToken = await this.createRefreshToken(user.id);

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 900, // 15 minutos
  };
}

async refreshToken(token: string) {
  const stored = await this.prisma.refreshToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    throw new UnauthorizedException('Invalid refresh token');
  }

  // Rotar el refresh token (invalidar el anterior)
  await this.prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revoked: true },
  });

  // Generar nuevos tokens
  return this.login({ email: stored.user.email, password: null });
}

@Post('refresh')
async refresh(@Body('refresh_token') token: string) {
  return this.authService.refreshToken(token);
}
```

---

### 5.4 Account Lockout (Protección Brute Force)

**Prioridad:** ALTA
**Esfuerzo:** 4 horas

#### Modelo Prisma:
```prisma
model LoginAttempt {
  id        String   @id @default(cuid())
  email     String
  ip        String
  success   Boolean
  createdAt DateTime @default(now())

  @@index([email, createdAt])
  @@index([ip, createdAt])
  @@map("login_attempts")
}
```

#### Implementación:
```typescript
// auth.service.ts
private readonly MAX_ATTEMPTS = 5;
private readonly LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutos

async checkAccountLockout(email: string, ip: string): Promise<void> {
  const recentAttempts = await this.prisma.loginAttempt.count({
    where: {
      email,
      success: false,
      createdAt: { gte: new Date(Date.now() - this.LOCKOUT_DURATION) },
    },
  });

  if (recentAttempts >= this.MAX_ATTEMPTS) {
    throw new ForbiddenException(
      `Account locked. Try again in ${this.LOCKOUT_DURATION / 60000} minutes.`
    );
  }
}

async recordLoginAttempt(email: string, ip: string, success: boolean) {
  await this.prisma.loginAttempt.create({
    data: { email, ip, success },
  });

  // Limpiar intentos antiguos (más de 24 horas)
  await this.prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  });
}
```

---

### 5.5 Error Tracking (Sentry)

**Prioridad:** MEDIA
**Esfuerzo:** 2-3 horas

#### Instalación:
```bash
# Backend
npm install @sentry/node

# Frontend
npm install @sentry/angular
```

#### Backend - Configuración:
```typescript
// main.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

// sentry.interceptor.ts
@Injectable()
export class SentryInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError(error => {
        Sentry.captureException(error);
        throw error;
      }),
    );
  }
}
```

#### Frontend - Configuración:
```typescript
// main.ts
import * as Sentry from '@sentry/angular';

Sentry.init({
  dsn: environment.sentryDsn,
  environment: environment.production ? 'production' : 'development',
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
});

// app.config.ts
providers: [
  { provide: ErrorHandler, useValue: Sentry.createErrorHandler() },
]
```

---

### 5.6 Response Compression

**Prioridad:** MEDIA
**Esfuerzo:** 30 minutos

```bash
npm install compression
npm install --save-dev @types/compression
```

```typescript
// main.ts
import * as compression from 'compression';

app.use(compression());
```

---

## Fase 6: Funcionalidades Avanzadas (Semanas 15-18)

### 6.1 PWA Support (Progressive Web App)

**Prioridad:** BAJA
**Esfuerzo:** 2-3 horas

```bash
cd Inv-App
ng add @angular/pwa
```

#### Beneficios:
- Funcionamiento offline
- Instalable en dispositivos
- Push notifications
- Mejor rendimiento con caching

---

### 6.2 WebSocket para Updates en Tiempo Real

**Prioridad:** BAJA
**Esfuerzo:** 1-2 días

#### Instalación:
```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
```

#### Gateway:
```typescript
// inventory.gateway.ts
@WebSocketGateway({ cors: true })
export class InventoryGateway {
  @WebSocketServer()
  server: Server;

  notifyInventoryUpdate(item: InventoryItem) {
    this.server.emit('inventory:updated', item);
  }

  notifyLowStock(item: InventoryItem) {
    this.server.emit('inventory:low-stock', item);
  }

  notifyNewTransaction(transaction: Transaction) {
    this.server.emit('transaction:created', transaction);
  }
}
```

#### Frontend:
```typescript
// socket.service.ts
import { io, Socket } from 'socket.io-client';

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket: Socket;

  connect() {
    this.socket = io(environment.apiUrl);

    this.socket.on('inventory:updated', (item) => {
      // Actualizar estado local
    });

    this.socket.on('inventory:low-stock', (item) => {
      // Mostrar notificación
    });
  }
}
```

---

### 6.3 2FA/MFA (Autenticación Multi-Factor)

**Prioridad:** BAJA
**Esfuerzo:** 1-2 días

#### Instalación:
```bash
npm install speakeasy qrcode
npm install --save-dev @types/speakeasy @types/qrcode
```

#### Modelo Prisma:
```prisma
model User {
  // ... campos existentes
  twoFactorSecret  String?
  twoFactorEnabled Boolean @default(false)
}
```

#### Implementación:
```typescript
// two-factor.service.ts
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

@Injectable()
export class TwoFactorService {
  generateSecret(user: User) {
    const secret = speakeasy.generateSecret({
      name: `Inventory:${user.email}`,
    });
    return secret;
  }

  async generateQRCode(otpauthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpauthUrl);
  }

  verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
    });
  }
}
```

---

### 6.4 Generación de Códigos de Barras/QR

**Prioridad:** BAJA
**Esfuerzo:** 4-6 horas

#### Instalación:
```bash
npm install bwip-js qrcode
npm install --save-dev @types/bwip-js
```

#### Endpoints:
```typescript
// barcodes.controller.ts
@Controller('barcodes')
export class BarcodesController {
  @Get('barcode/:sku')
  async generateBarcode(@Param('sku') sku: string, @Res() res: Response) {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text: sku,
      scale: 3,
      height: 10,
      includetext: true,
    });

    res.set('Content-Type', 'image/png');
    res.send(png);
  }

  @Get('qr/:id')
  async generateQR(@Param('id') id: string, @Res() res: Response) {
    const item = await this.inventoryService.findOne(id);
    const qrData = JSON.stringify({
      id: item.id,
      sku: item.sku,
      name: item.name,
    });

    const qrCode = await QRCode.toBuffer(qrData);
    res.set('Content-Type', 'image/png');
    res.send(qrCode);
  }
}
```

---

### 6.5 Virtual Scrolling (Listas Grandes)

**Prioridad:** BAJA
**Esfuerzo:** 2-3 horas

#### Frontend:
```typescript
// inventory-list.component.ts
import { ScrollingModule } from '@angular/cdk/scrolling';

@Component({
  imports: [ScrollingModule],
  template: `
    <cdk-virtual-scroll-viewport itemSize="56" class="h-[600px]">
      <div *cdkVirtualFor="let item of items; trackBy: trackById"
           class="flex items-center p-4 border-b">
        <span>{{ item.name }}</span>
        <span>{{ item.quantity }}</span>
      </div>
    </cdk-virtual-scroll-viewport>
  `
})
export class InventoryListComponent {
  trackById = (index: number, item: InventoryItem) => item.id;
}
```

---

### 6.6 Full-Text Search

**Prioridad:** BAJA
**Esfuerzo:** 1 día

#### PostgreSQL Full-Text Search:
```prisma
// En schema.prod.prisma
model InventoryItem {
  // ... campos existentes
  searchVector Unsupported("tsvector")?

  @@index([searchVector], type: Gin)
}
```

```typescript
// inventory.service.ts
async fullTextSearch(query: string) {
  return this.prisma.$queryRaw`
    SELECT * FROM inventory_items
    WHERE search_vector @@ plainto_tsquery('spanish', ${query})
    ORDER BY ts_rank(search_vector, plainto_tsquery('spanish', ${query})) DESC
  `;
}
```

---

### 6.7 Repository Pattern (Backend)

**Prioridad:** BAJA
**Esfuerzo:** 1-2 días

#### Base Repository:
```typescript
// base.repository.ts
export abstract class BaseRepository<T> {
  constructor(
    protected prisma: PrismaService,
    protected model: string,
  ) {}

  async findAll(options?: { skip?: number; take?: number }): Promise<T[]> {
    return (this.prisma as any)[this.model].findMany(options);
  }

  async findById(id: string): Promise<T | null> {
    return (this.prisma as any)[this.model].findUnique({ where: { id } });
  }

  async create(data: Partial<T>): Promise<T> {
    return (this.prisma as any)[this.model].create({ data });
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    return (this.prisma as any)[this.model].update({ where: { id }, data });
  }

  async delete(id: string): Promise<T> {
    return (this.prisma as any)[this.model].delete({ where: { id } });
  }
}

// inventory.repository.ts
@Injectable()
export class InventoryRepository extends BaseRepository<InventoryItem> {
  constructor(prisma: PrismaService) {
    super(prisma, 'inventoryItem');
  }

  async findLowStock(): Promise<InventoryItem[]> {
    return this.prisma.inventoryItem.findMany({
      where: { quantity: { lte: this.prisma.inventoryItem.fields.minQuantity } },
    });
  }
}
```

---

### 6.8 Generic CRUD Dialog (Frontend)

**Prioridad:** BAJA
**Esfuerzo:** 4-6 horas

```typescript
// generic-dialog.component.ts
@Component({
  selector: 'app-generic-dialog',
  template: `
    <h2 mat-dialog-title>{{ data.title | translate }}</h2>
    <mat-dialog-content>
      <form [formGroup]="form">
        @for (field of data.fields; track field.name) {
          <mat-form-field class="w-full">
            <mat-label>{{ field.label | translate }}</mat-label>
            @switch (field.type) {
              @case ('text') {
                <input matInput [formControlName]="field.name">
              }
              @case ('number') {
                <input matInput type="number" [formControlName]="field.name">
              }
              @case ('select') {
                <mat-select [formControlName]="field.name">
                  @for (option of field.options; track option.value) {
                    <mat-option [value]="option.value">{{ option.label }}</mat-option>
                  }
                </mat-select>
              }
              @case ('textarea') {
                <textarea matInput [formControlName]="field.name"></textarea>
              }
            }
          </mat-form-field>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'common.cancel' | translate }}</button>
      <button mat-raised-button color="primary" (click)="save()">
        {{ 'common.save' | translate }}
      </button>
    </mat-dialog-actions>
  `
})
export class GenericDialogComponent {
  form: FormGroup;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: DialogConfig,
    private dialogRef: MatDialogRef<GenericDialogComponent>,
    private fb: FormBuilder,
  ) {
    this.form = this.buildForm();
  }

  private buildForm(): FormGroup {
    const group: Record<string, any> = {};
    for (const field of this.data.fields) {
      group[field.name] = [field.value || '', field.validators || []];
    }
    return this.fb.group(group);
  }

  save() {
    if (this.form.valid) {
      this.dialogRef.close(this.form.value);
    }
  }
}
```

---

### 6.9 Sistema de Garantías para Items Únicos

**Prioridad:** MEDIA
**Esfuerzo:** 2-3 días

#### Descripción:
Sistema para trackear garantías de items únicos (con `serviceTag`). La garantía es **opcional** - no todos los items requieren información de garantía.

#### Modelo Prisma:
```prisma
model Warranty {
  id                String          @id @default(cuid())

  // Relación con item único (1:1 opcional)
  inventoryItemId   String          @unique
  inventoryItem     InventoryItem   @relation(fields: [inventoryItemId], references: [id])

  // Fechas
  startDate         DateTime        // Fecha de inicio (compra/activación)
  endDate           DateTime        // Fecha de expiración

  // Información
  warrantyType      WarrantyType    @default(MANUFACTURER)
  provider          String?         // Proveedor (Dell, HP, Lenovo, etc.)
  policyNumber      String?         // Número de póliza/contrato

  // Estado
  status            WarrantyStatus  @default(ACTIVE)

  // Documentación
  notes             String?
  documentUrl       String?         // Link a documento/factura

  // Tracking
  createdById       String
  createdBy         User            @relation(fields: [createdById], references: [id])
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  // Claims/Reclamos
  claims            WarrantyClaim[]

  @@index([endDate])
  @@index([status])
  @@map("warranties")
}

enum WarrantyType {
  MANUFACTURER      // Garantía de fábrica
  EXTENDED          // Garantía extendida
  THIRD_PARTY       // Terceros
}

enum WarrantyStatus {
  ACTIVE            // Vigente
  EXPIRED           // Expirada
  CLAIMED           // En reclamo
  VOID              // Anulada
}

model WarrantyClaim {
  id                String        @id @default(cuid())

  warrantyId        String
  warranty          Warranty      @relation(fields: [warrantyId], references: [id])

  claimDate         DateTime      @default(now())
  issueDescription  String
  resolution        String?
  status            ClaimStatus   @default(PENDING)

  // Si hubo reemplazo
  replacementItemId String?

  createdById       String
  createdBy         User          @relation(fields: [createdById], references: [id])
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  @@index([warrantyId])
  @@index([status])
  @@map("warranty_claims")
}

enum ClaimStatus {
  PENDING           // Pendiente
  IN_PROGRESS       // En proceso
  APPROVED          // Aprobado
  REJECTED          // Rechazado
  COMPLETED         // Completado (item reemplazado/reparado)
}
```

#### Relación en InventoryItem:
```prisma
model InventoryItem {
  // ... campos existentes
  warranty          Warranty?     // Relación 1:1 opcional
}
```

#### Endpoints Backend:
```typescript
// warranties.controller.ts
@Controller('warranties')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarrantiesController {
  // CRUD de garantías
  @Post()
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  create(@Body() dto: CreateWarrantyDto, @Request() req) { }

  @Get()
  findAll(@Query() filters: WarrantyFilterDto) { }

  @Get('expiring-soon')
  findExpiringSoon(@Query('days') days: number = 30) { }

  @Get('expired')
  findExpired() { }

  @Get('item/:itemId')
  findByItem(@Param('itemId') itemId: string) { }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  update(@Param('id') id: string, @Body() dto: UpdateWarrantyDto) { }

  @Delete(':id')
  @Roles('SYSTEM_ADMIN')
  remove(@Param('id') id: string) { }

  // Claims
  @Post(':id/claims')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  createClaim(@Param('id') id: string, @Body() dto: CreateClaimDto) { }

  @Patch('claims/:claimId')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  updateClaim(@Param('claimId') id: string, @Body() dto: UpdateClaimDto) { }
}
```

#### UI Frontend:

**En detalle del item único:**
| Situación | Mostrar |
|-----------|---------|
| Sin garantía | Botón "➕ Agregar Garantía" |
| Garantía activa | ✅ Badge verde + días restantes |
| Por vencer (30 días) | ⚠️ Badge amarillo + alerta |
| Expirada | ❌ Badge rojo |
| En reclamo | 🔵 Badge azul + estado del claim |

**Sección de garantía (expandible):**
```
┌─────────────────────────────────────────────────┐
│ 📋 Garantía                              [Edit] │
├─────────────────────────────────────────────────┤
│ Estado:     ✅ Activa                           │
│ Tipo:       Fabricante (Dell)                   │
│ Vigencia:   15/01/2025 - 15/01/2028            │
│ Restante:   547 días                            │
│ Póliza:     #DL-2025-12345                      │
│                                                 │
│ [📄 Ver documento]  [🔔 Crear reclamo]          │
└─────────────────────────────────────────────────┘
```

#### Alertas automáticas:
- Cron job que verifica garantías próximas a vencer (30, 15, 7 días)
- Actualiza `status` a `EXPIRED` cuando vence
- Notificación a usuarios con items en garantía por vencer

---

## Checklist de Implementación

### Fase 1: Seguridad ✅ COMPLETADA
- [x] 1.1 RBAC implementado (`roles.guard.ts`, `roles.decorator.ts`, `current-user.decorator.ts`)
- [x] 1.2 JWT Secret sin fallback (`configService.getOrThrow()`)
- [x] 1.3 Rate limiting activo (`@nestjs/throttler` configurado)
- [x] 1.4 Tokens en httpOnly cookies (implementado en auth.controller.ts)
- [x] 1.5 Cambio de contraseña funcional (endpoint `/auth/change-password`)
- [x] 1.6 SQL Raw eliminado (usando Prisma transactions)

### Fase 2: Estabilidad ✅ COMPLETADA
- [x] 2.1 Paginación en todos los endpoints (users, suppliers, warehouses, categories, transactions, loans)
- [x] 2.2 Sistema de logging implementado (Winston con `logs/error.log`, `logs/combined.log`, `logs/http.log`)
- [x] 2.3 Error interceptor global (`logging.interceptor.ts`, `http-exception.filter.ts`)
- [x] 2.4 AuditLog funcional (`audit.service.ts`, `audit.module.ts`)
- [x] 2.5 Tests unitarios - **141 tests, ~32% cobertura**
  - `auth.service.spec.ts` (12 tests)
  - `inventory.service.spec.ts` (21 tests)
  - `loans.service.spec.ts` (22 tests)
  - `transactions.service.spec.ts` (15 tests)
  - `users.service.spec.ts` (18 tests)
  - `categories.service.spec.ts` (12 tests)
  - `suppliers.service.spec.ts` (11 tests)
  - `warehouses.service.spec.ts` (12 tests)
  - `audit.service.spec.ts` (9 tests)
  - `roles.guard.spec.ts` (7 tests)
  - `jwt-auth.guard.spec.ts` (2 tests)

### Fase 3: Funcionalidades ✅ COMPLETADA
- [x] 3.1 Operaciones en lote (`bulk-update`, `bulk-delete`, `bulk-import`, `bulk-import/excel`)
  - `inventory.controller.ts` - Endpoints para operaciones masivas
  - `bulk-operations.dto.ts` - DTOs de validación
  - Soporte para importación desde Excel con parsing automático
- [x] 3.2 Alertas de stock bajo (`alerts.module.ts`)
  - `AlertsService` con cron job cada 6 horas
  - Endpoints: `/alerts`, `/alerts/active`, `/alerts/stats`, `/alerts/trigger-check`
  - Modelo `StockAlert` con estados: LOW_STOCK, OUT_OF_STOCK, EXPIRING_SOON
- [x] 3.3 Workflow de aprobación (`transfer-requests.module.ts`)
  - Modelo `TransferRequest` con estados: PENDING, APPROVED, REJECTED, COMPLETED, CANCELLED
  - Endpoints: create, approve, reject, complete, cancel
  - Validación de stock y transferencia automática
- [x] 3.4 Exportación Excel/PDF (`reports.module.ts`)
  - `GET /reports/inventory/excel` - Inventario completo
  - `GET /reports/inventory/pdf` - Reporte PDF con resumen
  - `GET /reports/low-stock/excel` - Items con stock bajo
  - `GET /reports/transactions/excel` - Transacciones
  - `GET /reports/loans/excel` - Préstamos
- [x] 3.5 Reconciliación de inventario (`stock-take.module.ts`)
  - Modelo `StockTake` y `StockTakeItem`
  - Crear conteo, registrar cantidades, calcular varianzas
  - Aplicar cambios automáticos al inventario
  - Reporte de varianzas

### Fase 4: Optimización ✅ COMPLETADA
- [x] 4.1 Lazy loading implementado (ApexCharts dinámico)
- [x] 4.2 Índices de BD agregados (50+ índices en schema.prisma)
- [x] 4.3 Caching activo (`CacheModule` en app.module.ts)
- [x] 4.4 Queries N+1 optimizadas (`include` usado en todos los servicios)

### Fase 5: Producción ✅ COMPLETADA
- [x] 5.1 Servicio de Email (`email.module.ts`, `email.service.ts`)
  - Templates HTML para emails ✅
  - Password reset email ✅
  - Password changed confirmation ✅
  - Welcome email ✅
- [x] 5.2 Flujo de reseteo de contraseña
  - `POST /auth/forgot-password` ✅
  - `POST /auth/reset-password/:token` ✅
  - Modelo `PasswordResetToken` ✅
- [x] 5.3 Refresh Tokens
  - Access token 15 minutos ✅
  - Refresh token 7/30 días con rotación ✅
  - Modelo `RefreshToken` ✅
  - Checkbox "Remember me" en frontend ✅
- [x] 5.4 Account Lockout (Brute Force)
  - Máximo 5 intentos fallidos ✅
  - Bloqueo de 15 minutos ✅
  - Modelo `LoginAttempt` ✅
- [x] 5.5 Error Tracking (Sentry)
  - `@sentry/nestjs` integrado en backend ✅
  - `SentryModule` y `SentryGlobalFilter` ✅
  - Configuración via `SENTRY_DSN` env var ✅
- [x] 5.6 Response Compression (GZIP) ✅

### Fase 6: Funcionalidades Avanzadas ⏳ PENDIENTE
- [ ] 6.1 PWA Support (ng add @angular/pwa)
- [ ] 6.2 WebSocket para updates en tiempo real
- [ ] 6.3 2FA/MFA (speakeasy + qrcode)
- [ ] 6.4 Generación de códigos de barras/QR
- [ ] 6.5 Virtual Scrolling (CDK)
- [ ] 6.6 Full-Text Search (PostgreSQL)
- [ ] 6.7 Repository Pattern (backend)
- [ ] 6.8 Generic CRUD Dialog (frontend)
- [ ] 6.9 Sistema de Garantías para Items Únicos

---

## Métricas de Éxito

| Métrica | Inicial | Actual | Objetivo |
|---------|---------|--------|----------|
| Cobertura de tests | ~0% | **32.85%** | >60% |
| Tests unitarios | 1 | **141** | - |
| Vulnerabilidades críticas | 6 | **0** ✅ | 0 |
| Sistema de logging | No | **Sí** ✅ | Sí |
| Paginación endpoints | Parcial | **100%** ✅ | 100% |
| Tiempo de respuesta API | Variable | Pendiente medir | <200ms |
| Errores en producción | Sin tracking | **Con logging** | <1% |

---

## Estimación de Tiempo Total

| Fase | Duración Estimada | Estado | Tiempo Real |
|------|-------------------|--------|-------------|
| Fase 1: Seguridad | 2 semanas | ✅ COMPLETADA | ~3 días |
| Fase 2: Estabilidad | 3 semanas | ✅ COMPLETADA | ~2 días |
| Fase 3: Funcionalidades | 4 semanas | ✅ COMPLETADA | ~1 día |
| Fase 4: Optimización | 2 semanas | ✅ COMPLETADA | ~1 día |
| Fase 5: Producción | 3 semanas | ✅ EN PROGRESO | ~1 día |
| Fase 6: Avanzadas | 4 semanas | ⏳ PENDIENTE | - |
| **Total Restante** | **4 semanas** | - | - |

---

## Próximos Pasos Recomendados

### Fase 5: Producción (Restantes)
1. **5.1 Email Service** - Pendiente para notificaciones
2. **5.5 Sentry** - Monitoreo de errores en producción

### Fase 6: Avanzadas (Prioridad Baja)
1. **6.1 PWA** - Mejor UX, offline support
2. **6.2 WebSockets** - Updates en tiempo real
3. **6.3 2FA** - Seguridad adicional para admins
4. **6.4 Barcodes/QR** - Útil para operaciones físicas
5. **6.5-6.8** - Mejoras de código y rendimiento

### Tests Adicionales (Opcional)
- Tests para nuevos módulos: alerts, transfer-requests, reports, stock-take
- Aumentar cobertura de ~32% a >60%

---

## Nuevos Endpoints Disponibles (Fase 3)

### Operaciones en Lote
- `POST /inventory/bulk-update` - Actualizar múltiples items
- `DELETE /inventory/bulk-delete` - Eliminar múltiples items
- `POST /inventory/bulk-import` - Importar items desde JSON
- `POST /inventory/bulk-import/excel` - Importar desde archivo Excel

### Alertas de Stock
- `GET /alerts` - Listar todas las alertas
- `GET /alerts/active` - Alertas activas (sin resolver)
- `GET /alerts/stats` - Estadísticas de alertas
- `POST /alerts/trigger-check` - Ejecutar verificación manual

### Workflow de Transferencias
- `POST /transfer-requests` - Crear solicitud
- `GET /transfer-requests` - Listar solicitudes
- `GET /transfer-requests/pending` - Solicitudes pendientes
- `PATCH /transfer-requests/:id/approve` - Aprobar
- `PATCH /transfer-requests/:id/reject` - Rechazar
- `PATCH /transfer-requests/:id/complete` - Completar transferencia
- `PATCH /transfer-requests/:id/cancel` - Cancelar

### Exportación de Reportes
- `GET /reports/inventory/excel` - Inventario en Excel
- `GET /reports/inventory/pdf` - Inventario en PDF
- `GET /reports/low-stock/excel` - Stock bajo en Excel
- `GET /reports/transactions/excel` - Transacciones en Excel
- `GET /reports/loans/excel` - Préstamos en Excel

### Reconciliación de Inventario
- `POST /stock-take` - Iniciar conteo
- `GET /stock-take` - Listar conteos
- `PATCH /stock-take/:id/items` - Registrar cantidad contada
- `PATCH /stock-take/:id/complete` - Completar conteo
- `GET /stock-take/:id/variance-report` - Reporte de varianzas

---

## Endpoints Planificados (Fases 5-6)

### Fase 5: Producción

#### Autenticación Extendida
- `POST /auth/forgot-password` - Solicitar reseteo de contraseña
- `POST /auth/reset-password/:token` - Resetear contraseña con token
- `POST /auth/refresh` - Renovar access token con refresh token
- `POST /auth/2fa/setup` - Configurar 2FA (Fase 6)
- `POST /auth/2fa/verify` - Verificar código 2FA (Fase 6)

### Fase 6: Funcionalidades Avanzadas

#### Códigos de Barras/QR
- `GET /barcodes/barcode/:sku` - Generar código de barras PNG
- `GET /barcodes/qr/:id` - Generar código QR PNG

#### WebSocket Events
- `inventory:updated` - Item de inventario actualizado
- `inventory:low-stock` - Alerta de stock bajo
- `transaction:created` - Nueva transacción creada
- `loan:overdue` - Préstamo vencido

#### Sistema de Garantías (6.9)
- `POST /warranties` - Crear garantía para item
- `GET /warranties` - Listar garantías con filtros
- `GET /warranties/expiring-soon?days=30` - Garantías por vencer
- `GET /warranties/expired` - Garantías expiradas
- `GET /warranties/item/:itemId` - Garantía de un item específico
- `PATCH /warranties/:id` - Actualizar garantía
- `DELETE /warranties/:id` - Eliminar garantía
- `POST /warranties/:id/claims` - Crear reclamo
- `PATCH /warranties/claims/:claimId` - Actualizar estado del reclamo

---

## Prioridades por Criticidad

| Prioridad | Items | Justificación |
|-----------|-------|---------------|
| 🔴 **CRÍTICA** | 5.1 Email, 5.2 Password Reset | Sin esto no es usable en producción |
| 🟠 **ALTA** | 5.3 Refresh Tokens, 5.4 Account Lockout | Seguridad esencial |
| 🟡 **MEDIA** | 4.1-4.4 Optimización, 5.5 Sentry, 5.6 Compression | Mejoras de rendimiento |
| 🟢 **BAJA** | 6.1-6.8 Avanzadas | Nice-to-have, pueden esperar |

---

*Documento actualizado el 22 de Enero 2026.*
