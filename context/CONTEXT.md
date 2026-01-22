# Contexto del Proyecto - INV-APP API

> **Lee este archivo al inicio de cada sesión de terminal**

---

## Arquitectura

| Componente | Tecnología | Entorno |
|------------|------------|---------|
| **Frontend** | Angular 19 | Vercel |
| **Backend** | NestJS + Prisma | Railway |
| **DB Dev** | SQLite | Local (`prisma/dev.db`) |
| **DB Prod** | PostgreSQL | Railway |

---

## Schemas de Prisma

```
prisma/
├── schema.prisma       # SQLite (desarrollo local)
├── schema.prod.prisma  # PostgreSQL (producción)
└── migrations/         # Solo para PostgreSQL
```

### Regla importante
Cuando modifiques el schema, **debes actualizar AMBOS archivos**:
1. `schema.prisma` - para desarrollo local
2. `schema.prod.prisma` - para producción

---

## Migraciones

**Desarrollo (SQLite):** No usa migraciones, usa `prisma db push`
```bash
npx prisma db push
```

**Producción (PostgreSQL):** Usa migraciones
```bash
# Crear migración manualmente (no tienes PostgreSQL local)
# 1. Crea carpeta: prisma/migrations/YYYYMMDDHHMMSS_nombre/
# 2. Crea archivo: migration.sql con el SQL necesario
```

### Formato de migración
```
prisma/migrations/
└── 20260113000000_add_color_to_categories/
    └── migration.sql
```

---

## Comandos útiles

### Desarrollo local
```bash
# Sincronizar schema con SQLite
npx prisma db push

# Generar cliente Prisma
npx prisma generate

# Ver datos
npx prisma studio

# Ejecutar seed
npm run seed
```

### Para producción (sin PostgreSQL local)
```bash
# Generar cliente para prod
npm run prisma:generate:prod

# Las migraciones se aplican automáticamente en Railway
# Ver: railway.json -> startCommand
```

---

## Deploy

### Railway (Backend)
- **Build:** `bun install && prisma generate --schema=./prisma/schema.prod.prisma && npm run build`
- **Start:** `npm run start` (ejecuta migraciones y arranca)

### Vercel (Frontend)
- Se configura en `Inv-App/vercel.json`

---

## Flujo para cambios en base de datos

1. Modificar `prisma/schema.prisma` (SQLite)
2. Ejecutar `npx prisma db push` para probar localmente
3. Copiar cambios a `prisma/schema.prod.prisma`
4. Crear migración manual en `prisma/migrations/`
5. Commit y push → Railway aplica migraciones automáticamente

---

## Pendientes actuales

- [ ] Error handling y feedback al usuario
- [ ] Pruebas de persistencia
- [ ] Charts con ng-apexcharts
- [ ] Exportar reportes (PDF, Excel)
- [ ] Tests unitarios y e2e

---

## URLs

| Servicio | URL |
|----------|-----|
| API Prod | https://[tu-app].up.railway.app |
| Frontend Prod | https://[tu-app].vercel.app |
| Railway Dashboard | https://railway.app/dashboard |
| Vercel Dashboard | https://vercel.com/dashboard |

---

*Última actualización: 2026-01-13*
