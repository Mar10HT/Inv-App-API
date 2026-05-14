# Fase 3.5 — SSO B2B (Google Workspace + Microsoft Entra)

Este documento captura el plan para agregar Single Sign-On a Obsid después de
Fase 3 (services tenant-aware) y antes de Fase 4 (frontend redesign).

## Estado

- **Estado**: planificado, **no implementado**
- **Cuándo**: después de Fase 3, antes de Fase 4. Renumerado como **Fase 3.5**.
- **Estimación**: 3-4 días core (Google + Microsoft + JIT + pending-approval) + 1-2 días para domain verification.
- **Bloqueantes**: requiere que Fase 3 termine — services tenant-aware son condición previa.

## Por qué SSO para Obsid

Target del producto = PYMEs y empresas con dominio propio. La mayoría ya está en
Google Workspace o Microsoft 365. Sin SSO:

- IT tiene que mantener una password más por empleado.
- Cuando alguien renuncia, hay que deprovisionar en N sistemas en vez de uno.
- Onboarding tarda más (admin invita → invite email → user setea password →
  user recuerda esa password).
- MFA queda a cargo de Obsid en vez de heredarla del IDP corporativo.

Con SSO los 4 puntos se resuelven gratis.

## Alcance

| Provider | Soportado | Razón |
|---|---|---|
| **Google Workspace** | ✅ Sí | Prioridad 1 en LATAM. La mayoría de PYMEs latinas usa Workspace. |
| **Microsoft Entra ID** (ex Azure AD) | ✅ Sí | Empresas grandes e industrias reguladas. |
| Microsoft personal accounts (MSA) | ❌ No | Dilute el posicionamiento B2B. |
| Google personal (`@gmail.com`) | ❌ No | Mismo motivo. |
| GitHub OAuth | ❌ No | Off-topic para inventario. |
| SAML genérico | ⚠️ Después | Necesario para enterprise grande. No en el scope inicial. |
| OIDC genérico | ⚠️ Después | Mismo que SAML. Si Entra ya está, ambos cubren la mayoría. |
| Magic links | Opcional | Útil para usuarios sin dominio corporativo (consultores externos). |

## Cambios al schema

Tres adiciones, agrupadas en una migración nueva `phase3_5_sso_columns`:

### 1. Columnas SSO en `users`

```sql
ALTER TABLE users ADD COLUMN "ssoProvider" TEXT;          -- 'google' | 'microsoft' | null
ALTER TABLE users ADD COLUMN "ssoSubject" TEXT;           -- stable ID from the IDP
ALTER TABLE users ADD COLUMN "ssoLinkedAt" TIMESTAMP;
ALTER TABLE users ADD COLUMN "isServiceAccount" BOOLEAN NOT NULL DEFAULT false;

-- A user can be linked to at most one SSO identity per provider
CREATE UNIQUE INDEX "users_ssoProvider_ssoSubject_key"
  ON users ("ssoProvider", "ssoSubject")
  WHERE "ssoSubject" IS NOT NULL;
```

**Por qué `ssoSubject` y no solo `email`**: si Jane cambia su email en Google
Workspace (matrimonio, rebranding de la empresa, etc.), el `sub` del IDP queda
igual. Matchear por `sub` post-link garantiza que la cuenta sigue siendo la
misma aunque el email cambie.

**`isServiceAccount`**: cuentas técnicas que NO deben pasar por SSO. Ejemplos:
una tablet kiosko en bodega que escanea QRs, un job scheduler. Mantienen
password aunque la org tenga SSO required.

### 2. Tabla `verified_domains`

```prisma
model VerifiedDomain {
  id             String       @id @default(cuid())
  organizationId String
  domain         String       // lowercase, normalized: "acme.com"
  verifiedAt     DateTime?
  verificationToken String    // Obsid-generated; admin puts in DNS TXT
  createdAt      DateTime     @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([domain])
  @@unique([organizationId, domain])
  @@index([organizationId])
}
```

- **`@@unique([domain])`** global: un dominio solo puede estar reclamado por
  UNA org. Si ACME ya reclamó `acme.com`, no podemos dejar que otra org se
  lo robe.
- **Verificación**: Obsid genera token tipo `obsid-domain-verify=ab12cd34...`.
  El admin lo agrega como TXT record en su DNS. Obsid hace un DNS lookup
  cada N minutos hasta que aparece, luego marca `verifiedAt = NOW()`.

### 3. Política de SSO en `organizations`

```sql
ALTER TABLE organizations ADD COLUMN "ssoProvider" TEXT;           -- 'google' | 'microsoft' | null
ALTER TABLE organizations ADD COLUMN "ssoEnforced" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN "ssoGracePeriodEndsAt" TIMESTAMP;
```

- **`ssoEnforced=false`**: password sigue funcionando junto a SSO.
- **`ssoEnforced=true`**: SSO obligatorio. Password se revoca al terminar el grace.
- **`ssoGracePeriodEndsAt`**: fecha en que los passwords de usuarios non-service
  se invalidan. Default sugerido: hoy + 30 días.

## Flujo de migración de un cliente existente

Caso real: OlanchNet (`org_on`) tiene 20 usuarios con email+password desde día
1. Quieren pasar a Google Workspace.

### Paso 1: Admin configura SSO

UI: Settings → Authentication → Enable SSO.

1. Elige provider: **Google Workspace**
2. Agrega dominios: `olanchnet.com` (puede agregar más después)
3. Obsid genera token: `obsid-domain-verify=4d7c6f-abcdef...`
4. Admin pone en DNS: `TXT @ "obsid-domain-verify=4d7c6f-abcdef..."`
5. Click "Verify" → Obsid hace DNS lookup → marca `verifiedAt`
6. Elige política (paso 4)

### Paso 2: Primer login SSO de Jane

1. Jane va a obsid.app → ve el botón "Sign in with Google" (visible siempre que la org tenga al menos un dominio verificado)
2. Click → Google la autentica → callback a Obsid con `{ email, sub, name, picture }`
3. Obsid normaliza el email a lowercase: `jane@olanchnet.com`
4. Lookup en `users` por email → la encuentra (la cuenta existente)
5. **Account linking**:
   ```sql
   UPDATE users SET
     "ssoProvider" = 'google',
     "ssoSubject" = '108234123124...',
     "ssoLinkedAt" = NOW()
   WHERE id = 'user_jane';
   ```
6. Mint refresh token nuevo con `organizationId` (lógica normal de Fase 2)
7. Audit log: `{ action: 'SSO_LINKED', userId, provider: 'google', subject: ... }`

Jane no pierde nada. Mismo userId, mismas memberships, mismo audit history.

### Paso 3: Política de transición (decisión del admin)

| Política | Comportamiento | Cuándo usar |
|---|---|---|
| **A. SSO + password en paralelo** | `ssoEnforced=false`. Ambos métodos funcionan indefinidamente. | Migración suave sin presión de tiempo. |
| **B. SSO required, password inmediato** | `ssoEnforced=true`, grace=0. Password revocado en cuanto se activa SSO. | Compliance estricto, todos los users saben de antemano. |
| **C. SSO required con grace period** | `ssoEnforced=true`, grace=30 días. Ambos métodos funcionan durante el grace, después solo SSO. | **Recomendado por default.** Balance entre rapidez y safety. |

Con C, Obsid manda dos emails automáticos:
- Día 0: "Tu org pasó a Google Sign-In. Hasta el día 30 podés usar password como
  fallback. Después solo SSO."
- Día 23: "Te quedan 7 días para hacer el primer login con Google. Tu password
  va a dejar de funcionar el [fecha]."

Día 30 a la medianoche: un cron pasa `password = NULL` para todos los users no
service-account de la org. El audit log registra cada revoke.

### Paso 4: Banner UI persistente durante el grace

Cuando un user de una org con `ssoEnforced=true` AND `ssoGracePeriodEndsAt > NOW()`
loguea con password, ve un banner:

> Tu organización migró a Google Sign-In. Te quedan **X días** para hacer el primer
> login con Google. Después tu password dejará de funcionar.
> [ Sign in with Google now ]

## Edge cases que hay que resolver

### 1. Email case sensitivity

Google puede devolver `Jane@OlanchNet.com`. La DB tiene `jane@olanchnet.com`.
Sin normalización, el match falla y Jane crea una cuenta duplicada.

**Fix**: normalizar a lowercase en todos los matches, tanto al crear users
como al matchear en el callback SSO.

### 2. Email cambió en el IDP

Jane se casó y ahora es `jane.smith@olanchnet.com` en Google Workspace. Obsid
tiene `jane.beltran@olanchnet.com`.

**Fix**: después del primer link, el match preferente es por `ssoSubject` no
por email. Si el sub matchea pero el email no, actualizamos el email en Obsid
con el del IDP.

```typescript
// Pseudocódigo del callback SSO
async function handleSsoCallback({ email, sub, provider }) {
  const normalizedEmail = email.toLowerCase();

  // Match preferente: ssoSubject (post-link)
  let user = await prisma.user.findFirst({
    where: { ssoProvider: provider, ssoSubject: sub },
  });

  if (user && user.email !== normalizedEmail) {
    // El email cambió en el IDP. Actualizamos el de Obsid.
    user = await prisma.user.update({
      where: { id: user.id },
      data: { email: normalizedEmail },
    });
  }

  if (!user) {
    // Primer login: match por email
    user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (user) {
      // Link
      user = await prisma.user.update({
        where: { id: user.id },
        data: { ssoProvider: provider, ssoSubject: sub, ssoLinkedAt: new Date() },
      });
    } else {
      // JIT provisioning (paso 5 abajo)
    }
  }

  return user;
}
```

### 3. JIT provisioning (usuario nuevo que SSO-loguea por primera vez)

Si `marco@olanchnet.com` no existe en Obsid pero el dominio `olanchnet.com` está
verificado para `org_on`:

**Opción A — Auto-create activo**: Obsid crea el user con role MEMBER. Marco
entra inmediatamente.
**Opción B — Auto-create pending**: Obsid crea el user con status PENDING_APPROVAL.
Admin recibe notificación, aprueba, Marco entra.
**Opción C — Bloquear**: Obsid rechaza el login. Admin tiene que invitar a Marco
explícitamente primero.

**Recomendación: Opción B** (default), con setting por org para cambiar a A si
el admin quiere onboarding sin fricción. Nunca C — fricción innecesaria si la
verificación de dominio ya garantiza autoridad.

### 4. Service accounts

Algunos users en Obsid son cuentas técnicas (kiosko de bodega, jobs, integraciones).
No existen en Google Workspace.

**Fix**: marca `isServiceAccount=true` en `users`. Esos bypasan la política
`ssoEnforced` aunque la org la tenga activa. Pueden seguir con password
indefinidamente.

UI: en la pantalla de creación/edición de user, checkbox "Service account
(skip SSO requirements)". Solo visible para SUPER_ADMIN y ORG_ADMIN.

### 5. Admin lockout (break-glass)

Si Google Workspace de OlanchNet se cae, ¿cómo entra el admin a Obsid para
desactivar SSO temporalmente?

**Reglas**:
- Toda org con `ssoEnforced=true` debe tener **al menos 1 user con
  `isServiceAccount=true` AND `orgRole=ORG_ADMIN`** como break-glass account.
- Obsid bloquea la activación de SSO si no se cumple esa precondición y
  obliga al admin a crear la break-glass account primero.
- Alternativa: 8 "recovery codes" generados al activar SSO, cada uno de un solo
  uso. Similar a 2FA backup codes.

### 6. Multi-org con el mismo email

Pedro trabaja en OlanchNet (`org_on`) Y como consultor en ACME (`org_acme`). Su
email es `pedro@gmail.com`.

- ACME tiene `ssoEnforced=true` con dominio `acme.com`. Pedro NO califica para
  entrar a ACME vía Google porque `@gmail.com` no es `@acme.com`.
- Si Pedro usa Google SSO, Obsid encuentra al user, devuelve un selector
  "¿A qué org querés entrar?" → muestra solo `org_on` (porque ACME requiere
  `@acme.com`).
- Si Pedro quiere entrar a ACME, debe usar password (ACME le tendría que crear
  cuenta de service account o relajar la política).

### 7. Deprovisioning real-time

HR desactiva `jane@olanchnet.com` en Google. ¿En cuánto tiempo Obsid se entera?

- **Sin SCIM**: Jane sigue con sesión activa hasta que expire su access token
  (15 min) y luego su refresh token (7 días por default). Suficiente para 90%
  de los casos.
- **Con SCIM**: deprovisioning en segundos. Requiere implementar SCIM 2.0
  endpoint en Obsid. Es bastante código, pensar si el target lo justifica.

**Recomendación inicial**: sin SCIM. Documentar el delay en el FAQ. Pasar a SCIM
si el primer cliente enterprise lo pide.

## Hand-off real con OlanchNet cuando llegue el momento

Plan operativo:

1. **Reunión técnica con IT** (30 min)
   - Confirmar provider (Google Workspace / Entra)
   - Listar dominios a verificar
   - Identificar break-glass admin (la persona que va a quedar con password)
   - Listar service accounts existentes que no deben SSO-loguear
2. **Admin agrega DNS TXT record** en su provider (Cloudflare, GoDaddy, lo que
   sea)
3. **Verificación en Obsid** (~ 5 minutos típicamente, depende del TTL del DNS)
4. **Activación con grace period de 30 días** y email automático a los users
5. **Banner persistente en UI** durante el grace
6. **Día 31**: cron revoca passwords no-service-account. Audit log marca cada
   revoke.
7. **Post-mortem 1 semana después**: ¿hay users que no se migraron? Si sí,
   admin extiende grace o convierte sus cuentas a service account.

Estimado total para el cliente: **2 semanas de calendario** (1 día setup, 30 días
grace, 1 día cleanup), **~2 horas de trabajo real**.

## Anti-patrones a evitar

- **No** copiar passwords del IDP a Obsid. Nunca. SSO significa que Obsid no ve
  passwords.
- **No** mezclar identidades: una cuenta de Obsid = una identidad SSO por
  provider. Si Jane tiene Google personal + Google Workspace, no son la misma
  cuenta Obsid.
- **No** auto-aprobar JIT sin domain verification. Sin DNS TXT verificado,
  cualquiera con un email del dominio podría crearse cuenta en la org.
- **No** asumir que el `email` del IDP es estable. Usar `sub`.
- **No** revocar passwords de service accounts. Quedarían sin auth.
- **No** activar `ssoEnforced` sin haber configurado break-glass account.
  Obsid debe bloquear esto explícitamente.

## Próximos pasos (cuando se retome)

1. Revisar este doc con el cliente y validar las decisiones (especialmente
   política C de 30 días y JIT con pending approval).
2. Agregar las tres migraciones de schema (columns en users, organizations,
   tabla verified_domains).
3. Implementar el módulo `auth/sso/`:
   - `GoogleStrategy` (Passport / OAuth 2.0)
   - `MicrosoftStrategy` (Entra v2 endpoint)
   - `SsoController` con `/auth/sso/:provider/start` y `/auth/sso/:provider/callback`
   - `DomainVerificationService` con DNS lookup via Node `dns.resolveTxt`
4. UI nueva: Settings → Authentication tab con configuración de SSO por org.
5. Email templates para la migración (initial notification, grace warning,
   final revoke).
6. Cron job que revoca passwords al terminar `ssoGracePeriodEndsAt`.
7. Tests E2E que cubran los 7 edge cases documentados arriba.
