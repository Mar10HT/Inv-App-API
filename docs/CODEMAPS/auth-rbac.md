# Auth & RBAC Codemap

**Last Updated:** 2026-04-03
**Modules:** `src/auth`, `src/permissions`
**Version:** 0.5.0 (granular RBAC system)
**Key Feature:** 46 granular permissions with 60s in-memory caching

---

## Overview

The Auth & RBAC system provides:

- **JWT Authentication** — 15-minute access tokens + 7-day refresh tokens via HttpOnly cookies
- **CSRF Protection** — Double Submit Cookie pattern
- **Granular RBAC** — 46 permissions across 14 modules (not role-based)
- **Permission Caching** — 60-second in-memory Map (no Redis)
- **Warehouse Access Control** — Users restricted to assigned warehouses or system-wide
- **Strong Passwords** — Bcryptjs with custom validation decorator
- **Security Headers** — Helmet + CSP, HSTS, X-Frame-Options

---

## Files & Entry Points

### Auth Module

| File | Purpose | Lines |
|------|---------|-------|
| `auth.controller.ts` | 13 endpoints (login, register, logout, profile, etc.) | ~250 |
| `auth.service.ts` | Token generation, password validation, user auth | ~350 |
| `auth.module.ts` | Module definition, JWT strategy | ~40 |
| `strategies/jwt.strategy.ts` | JWT token validation | ~30 |
| `guards/jwt-auth.guard.ts` | Route protection | ~20 |
| `guards/permissions.guard.ts` | Permission-based authorization | ~40 |
| `decorators/current-user.decorator.ts` | User injection | ~15 |
| `decorators/permissions.decorator.ts` | @Permissions() route guard | ~10 |
| `decorators/roles.decorator.ts` | @Roles() (deprecated, legacy) | ~10 |
| `decorators/strong-password.decorator.ts` | Password validation | ~20 |
| `dto/login.dto.ts` | Login payload | ~10 |
| `dto/register.dto.ts` | Registration payload | ~15 |
| `dto/refresh-token.dto.ts` | Token refresh | ~10 |
| `dto/change-password.dto.ts` | Password change | ~10 |

### Permissions Module

| File | Purpose | Lines |
|------|---------|-------|
| `permissions.service.ts` | Permission caching + resolution | ~150 |
| `permissions.module.ts` | Module export | ~20 |
| `../common/constants/permissions.constant.ts` | 46 permissions definition | ~120 |

---

## API Endpoints

### Authentication

```http
POST   /auth/register                  # Create new user account
POST   /auth/login                     # Login (returns JWT + refresh)
POST   /auth/logout                    # Logout (clear cookies)
POST   /auth/refresh                   # Get new access token
GET    /auth/me                        # Get current user profile + permissions
```

### Password Management

```http
POST   /auth/forgot-password           # Request password reset email
POST   /auth/reset-password            # Reset password via token
PATCH  /auth/change-password           # Change password (authenticated)
POST   /auth/strong-password           # Validate password strength
```

### Admin Operations

```http
GET    /auth/pending-resets            # List pending password resets
POST   /auth/admin/generate-reset-link/:userId # Generate reset link for user
```

---

## Authentication Flow

### Login

```
POST /auth/login
├─ Validate email + password
├─ Hash check password (bcryptjs.compare)
├─ Generate JWT access token (15 min expiry)
├─ Generate JWT refresh token (7 day expiry)
├─ Query PermissionsService (resolves user permissions)
├─ Set HttpOnly cookies (access_token, refresh_token, csrf_token)
├─ Return user + permissionsVersion + CSRF token
└─ Audit: Log login event
```

**Response:**
```json
{
  "user": {
    "id": "user-123",
    "email": "manager@example.com",
    "name": "Warehouse Manager",
    "roleId": "role-123",
    "warehouseIds": ["w1", "w2"],
    "permissionsVersion": 1
  },
  "accessToken": "eyJhbGc...",
  "permissionsVersion": 1,
  "csrfToken": "efd2ac..."
}
```

---

### Token Refresh

```
POST /auth/refresh
├─ Read refresh_token from cookie (or body for mobile)
├─ Validate refresh token (JWT signature)
├─ Generate new access_token (15 min)
├─ Set new access_token cookie
└─ Return new accessToken
```

**Mobile Support:** Can also accept `refreshToken` in request body.

```json
{
  "refreshToken": "eyJhbGc..."
}
```

---

### Logout

```
POST /auth/logout
├─ Clear access_token cookie
├─ Clear refresh_token cookie
├─ Clear csrf_token cookie
└─ Return { message: "Logged out" }
```

---

## Authorization: Granular RBAC

### Concept: Permissions > Roles

**Old Model (Deprecated):**
```
User → Role (SYSTEM_ADMIN, WAREHOUSE_MANAGER, USER)
        ↓
     Role-based access (all admins have same perms)
```

**New Model (v0.5.0+):**
```
User → [can have multiple Roles]
Role → [Permissions via RolePermission join table]
        ↓
     Granular access (each permission independently granted)
```

### Permission System

**46 Total Permissions:**

```
auth:login, auth:register, auth:refresh, auth:logout,
auth:forgot_password, auth:reset_password, auth:change_password,
inventory:view, inventory:create, inventory:update, inventory:delete,
inventory:bulk_import, inventory:bulk_update, inventory:bulk_delete,
warehouses:view, warehouses:create, warehouses:update, warehouses:delete,
suppliers:view, suppliers:create, suppliers:update, suppliers:delete,
categories:view, categories:create, categories:update, categories:delete,
loans:view, loans:create, loans:manage, loans:delete,
transfers:view, transfers:create, transfers:manage,
transactions:view, transactions:create, transactions:update, transactions:delete,
reports:view, reports:generate, reports:export,
alerts:view, alerts:manage,
audit:view,
users:view, users:create, users:update, users:delete,
roles:view, roles:create, roles:update, roles:delete
```

### Seeded Roles

| Role | Permissions | Purpose |
|------|-------------|---------|
| **SYSTEM_ADMIN** | All 46 permissions | Full system access |
| **WAREHOUSE_MANAGER** | ~25 permissions | Operations + inventory mgmt + alerts |
| **USER** | ~15 permissions | View, create, manage (not delete) |
| **VIEWER** | ~8 permissions | View-only (read all data) |
| **EXTERNAL** | ~5 permissions | Limited (e.g., discharge form submission) |

---

## Permission Caching

### PermissionsService

**Purpose:** Fast permission resolution with 60-second TTL cache.

**Implementation:**

```typescript
@Injectable()
export class PermissionsService {
  private cache = new Map<string, CachedPermissions>();
  private readonly CACHE_TTL = 60_000; // 60 seconds

  async getUserPermissions(userId: string): Promise<Set<string>> {
    const cached = this.cache.get(userId);

    // Cache hit
    if (cached && Date.now() < cached.expiresAt) {
      return cached.permissions;
    }

    // Cache miss: fetch from DB
    const roles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: { include: { permissions: true } } }
    });

    const permissionSet = new Set<string>();
    roles.forEach(ur => {
      ur.role.permissions.forEach(rp => {
        permissionSet.add(rp.permission.code);
      });
    });

    // Store in cache
    this.cache.set(userId, {
      permissions: permissionSet,
      expiresAt: Date.now() + this.CACHE_TTL
    });

    return permissionSet;
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }
}
```

**Invalidation Triggers:**
- User role changes
- User permissions updated
- `permissionsVersion` incremented (signals frontend to refetch)

---

## Route Protection

### @Permissions() Decorator

**Definition:**
```typescript
@Permissions('loans:create', 'loans:manage')
loanEndpoint() { ... }
```

Means: User must have **at least one** of the listed permissions.

---

### PermissionsGuard

**Implementation:**

```typescript
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private permissionsService: PermissionsService,
    private reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Get required permissions from decorator
    const requiredPerms = this.reflector.get<string[]>(
      PERMISSIONS_KEY,
      context.getHandler()
    );

    // No permissions required → allow
    if (!requiredPerms || requiredPerms.length === 0) {
      return true;
    }

    // 2. Get user from request
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Attached by JwtAuthGuard

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 3. Resolve user permissions (cached)
    const userPerms = await this.permissionsService.getUserPermissions(user.id);

    // 4. Check if user has at least one required permission
    const hasPermission = requiredPerms.some(perm => userPerms.has(perm));

    if (!hasPermission) {
      throw new ForbiddenException(
        `Missing required permission: ${requiredPerms.join(' OR ')}`
      );
    }

    return true;
  }
}
```

---

### @CurrentUser() Decorator

Injects authenticated user into request handler:

```typescript
@Get('me')
getProfile(@CurrentUser() user: AuthenticatedUser) {
  return user; // { id, email, name, warehouseIds, ... }
}
```

---

## Warehouse Access Control

### Concept: Warehouse-Level Filtering

Users can be restricted to specific warehouses:

```typescript
interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string;
  warehouseIds: string[] | null; // null = system-wide access
  roleId: string;
}
```

**Logic:**
- **Admin** (`warehouseIds === null`) → can access all warehouses
- **Warehouse Manager** (`warehouseIds = ['w1', 'w2']`) → can access only assigned warehouses

### Warehouse Filter Utility

```typescript
function warehouseFilterMultiField(
  warehouseIds: string[] | null,
  fields: string[] // e.g., ['sourceWarehouseId', 'destinationWarehouseId']
): Prisma.WhereCondition {
  if (warehouseIds === null) {
    return {}; // No filter (system-wide access)
  }

  // User can see records where ANY field matches their warehouses
  return {
    OR: fields.map(field => ({
      [field]: { in: warehouseIds }
    }))
  };
}
```

**Example Usage:**

```typescript
// User is warehouse manager with access to w1, w2
// Query: GET /transfer-requests

const where = {
  ...warehouseFilterMultiField(user.warehouseIds, ['sourceWarehouseId', 'destinationWarehouseId'])
  // Becomes: { OR: [ { sourceWarehouseId: { in: ['w1', 'w2'] } }, { destinationWarehouseId: { in: ['w1', 'w2'] } } ] }
};

// User sees transfers where they're source or destination warehouse
const transfers = await prisma.transferRequest.findMany({ where });
```

---

## Security Features

### Password Hashing

```typescript
const hashedPassword = await bcrypt.hash(password, 10); // 10 salt rounds
const isValid = await bcrypt.compare(inputPassword, hashedPassword);
```

### Strong Password Policy

**Requirements:**
- Minimum 8 characters
- At least 1 uppercase letter (A–Z)
- At least 1 lowercase letter (a–z)
- At least 1 number (0–9)
- At least 1 special character (!@#$%^&*)

**Validation Decorator:**
```typescript
@StrongPassword()
password: string;
```

---

### JWT Token Configuration

**Access Token:**
- Expiry: 15 minutes
- Delivered: HttpOnly cookie + response body
- Signed: HS256 (shared secret)

**Refresh Token:**
- Expiry: 7 days
- Delivered: HttpOnly cookie only (never in response body)
- Signed: HS256

**CSRF Token:**
- Random string
- Delivered: Response body + cookie
- Validated: Double Submit pattern

---

### CSRF Protection

**Implementation:** `csrf-csrf` package with Double Submit Cookie.

**Flow:**
1. Generate random CSRF token
2. Store in HttpOnly cookie
3. Return token in response body
4. Client submits token in `X-CSRF-Token` header
5. Server validates: header token matches cookie

**Automatic:** All state-changing requests (POST, PATCH, DELETE) require CSRF token.

---

### Helmet Security Headers

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"]
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true
}));
```

---

## Password Reset Flow

### Forgot Password

```
POST /auth/forgot-password
├─ Find user by email
├─ Generate reset token (JWT, 1-hour expiry)
├─ Store reset link (email it to user)
└─ Return { message: "Check your email" }
```

### Reset Password

```
POST /auth/reset-password
├─ Validate reset token (JWT signature + expiry)
├─ Hash new password
├─ Update user.password
└─ Return { message: "Password reset successful" }
```

### Change Password

```
PATCH /auth/change-password
├─ Validate current password (must be authenticated)
├─ Validate new password strength
├─ Hash new password
├─ Update user.password
└─ Return { message: "Password changed" }
```

---

## User Profile Endpoint

```
GET /auth/me
├─ Return current user
├─ Resolve permissions from PermissionsService (cached)
├─ Return permissionsVersion for frontend polling
└─ Payload:
{
  "id": "user-123",
  "email": "manager@example.com",
  "name": "Warehouse Manager",
  "roleId": "role-123",
  "warehouseIds": ["w1", "w2"],
  "permissionsVersion": 1,
  "permissions": ["loans:view", "loans:create", ...]
}
```

**Frontend Use:** On login, save permissionsVersion. Poll `/auth/me` if admin changes user's role (detected via WebSocket or polling).

---

## Data Model

### User

```typescript
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  password      String   // Hashed (bcryptjs)
  name          String
  roleId        String
  role          Role     @relation(fields: [roleId], references: [id])

  // Permissions caching
  permissionsVersion Int @default(1) // Increment to signal permission change

  // Warehouse assignment
  warehouses    UserWarehouse[]

  // Relations
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([email])
  @@index([roleId])
}

model Role {
  id            String   @id @default(cuid())
  name          String   @unique // SYSTEM_ADMIN, WAREHOUSE_MANAGER, etc.
  description   String?

  // Permissions (many-to-many)
  permissions   RolePermission[]

  users         User[]
  createdAt     DateTime @default(now())
}

model Permission {
  id            String   @id @default(cuid())
  code          String   @unique // "loans:create", "inventory:view", etc.
  description   String?
  module        String   // "loans", "inventory", etc.

  roles         RolePermission[]
  createdAt     DateTime @default(now())
}

model RolePermission {
  roleId        String
  permissionId  String
  role          Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission    Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  @@id([roleId, permissionId])
}

model UserWarehouse {
  userId        String
  warehouseId   String
  roleId        String?    // Per-warehouse role (future)
  user          User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  warehouse     Warehouse  @relation(fields: [warehouseId], references: [id], onDelete: Cascade)

  @@id([userId, warehouseId])
}
```

---

## Audit Trail

All auth events are logged:

```json
{
  "action": "LOGIN",
  "entity": "User",
  "entityId": "user-123",
  "userId": "user-123",
  "changes": { "ip": "192.168.1.1", "userAgent": "Mozilla..." },
  "timestamp": "2026-04-03T10:30:00Z"
}
```

**Tracked Events:**
- LOGIN
- LOGOUT
- PASSWORD_CHANGED
- PASSWORD_RESET
- REGISTER
- ROLE_ASSIGNED
- PERMISSIONS_UPDATED

---

## Testing

### Unit Tests

**Location:** `src/auth/` (tests for specific scenarios)

**Coverage:**
- Token generation/validation
- Password hashing/comparison
- Strong password validation
- Permission resolution + caching
- Warehouse filter logic

---

## External Dependencies

| Package | Purpose | Version |
|---------|---------|---------|
| `@nestjs/passport` | Auth strategy integration | 11.0.5 |
| `passport-jwt` | JWT strategy | 4.0.1 |
| `bcryptjs` | Password hashing | 3.0.3 |
| `csrf-csrf` | CSRF protection | 4.0.3 |
| `helmet` | Security headers | 8.1.0 |

---

## Related Areas

- **[Permissions Module](../permissions)** — In-memory caching + resolution
- **[Auth Module](../auth)** — JWT, password, CSRF
- **[Warehouse Access Control](../common/warehouse-access)** — Filter utility
- **[Audit Module](../audit)** — Activity logging

---

## Quick Reference

### Common Auth Flows

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "manager@example.com", "password": "TestPassword123!"}'

# Response: { user, accessToken, permissionsVersion, csrfToken }
```

**Get Profile + Permissions:**
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <accessToken>"

# Response: { id, email, name, permissions: [...], permissionsVersion }
```

**Logout:**
```bash
curl -X POST http://localhost:3000/api/auth/logout
# Clears all cookies
```

**Change Password:**
```bash
curl -X PATCH http://localhost:3000/api/auth/change-password \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"currentPassword": "Old123!", "newPassword": "New456!"}'
```

---

## Security Checklist

- [x] JWT tokens via HttpOnly cookies
- [x] Refresh token rotation (separate from access)
- [x] CSRF protection (double submit)
- [x] Password hashing (bcryptjs, salt=10)
- [x] Strong password policy (8+ chars, mixed case, number, special)
- [x] Rate limiting on auth endpoints
- [x] Helmet security headers
- [x] Granular permissions (46 permissions)
- [x] Warehouse-level access control
- [x] Audit trail for auth events

---

**Last Updated:** 2026-04-03 | **Maintainer:** Mario Herrera
