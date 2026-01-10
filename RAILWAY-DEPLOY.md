# Railway Deployment Guide - INV-APP Backend

## Step 1: Prepare Your Project for PostgreSQL

### Update `.env` for local PostgreSQL testing (optional)

```env
# For local testing with PostgreSQL (optional)
DATABASE_URL="postgresql://postgres:password@localhost:5432/invapp?schema=public"

# Keep these
JWT_SECRET="your-super-secret-key-change-this-in-production"
PORT=3000
NODE_ENV=production
```

**Note:** You don't need to run migrations locally. Railway will handle the database.

---

## Step 2: Push to GitHub

```bash
cd Inv-App-API

# Add all files
git add .

# Commit
git commit -m "feat: switch to PostgreSQL for production deployment"

# Push
git push origin main
```

---

## Step 3: Deploy to Railway

### A. Create Railway Account
1. Go to https://railway.app
2. Sign up with GitHub

### B. Create New Project
1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Authorize Railway to access your repos
4. Select **`Inv-App-API`** repository

### C. Add PostgreSQL Database
1. In your project, click **"New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway automatically creates the database
4. Railway automatically sets `DATABASE_URL` environment variable

### D. Configure Environment Variables
1. Click on your service (the one running the code)
2. Go to **"Variables"** tab
3. Add these variables:

```
JWT_SECRET=change-this-to-a-very-secure-random-string
NODE_ENV=production
PORT=3000
```

**Generate secure JWT_SECRET:**
```bash
# In terminal
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### E. Configure Build Settings (if needed)

Railway should auto-detect, but if not:

1. Go to **"Settings"** tab
2. **Build Command:** `npm install && npx prisma generate && npm run build`
3. **Start Command:** `npm run start:prod`
4. **Root Directory:** `/` (or leave empty)

### F. Add Deployment Script

Create `package.json` script for Railway:

```json
{
  "scripts": {
    "build": "nest build",
    "start:prod": "node dist/src/main",
    "railway:deploy": "npx prisma migrate deploy && npm run seed && npm run start:prod"
  }
}
```

Actually, let me update this properly:

---

## Step 4: Update package.json

Add Railway-specific scripts:

```json
{
  "scripts": {
    "prebuild": "rimraf dist",
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "start:prod": "node dist/src/main",
    "railway:build": "npm install && npx prisma generate && npm run build",
    "railway:start": "npx prisma migrate deploy && node dist/src/main"
  }
}
```

---

## Step 5: Configure Railway Build

In Railway dashboard:

**Settings > Deploy:**
- **Build Command:** `npm run railway:build`
- **Start Command:** `npm run railway:start`

This will:
1. Install dependencies
2. Generate Prisma client
3. Build NestJS
4. Run migrations
5. Start server

---

## Step 6: Seed Database (One Time)

After first deployment:

1. Go to Railway dashboard
2. Click your service
3. Go to **"Deployments"** tab
4. Click on latest deployment
5. Click **"View Logs"**
6. Wait for "Application is running" message
7. Go to **"Settings"** > **"Networking"**
8. Note your public URL (e.g., `https://your-app.up.railway.app`)

**Seed via Railway Shell:**
1. In dashboard, click your service
2. Click on the **three dots** menu (⋯)
3. Select **"Shell"**
4. Run:
```bash
npm run seed
```

**OR seed via local connection:**
```bash
# Get DATABASE_URL from Railway Variables tab
# Copy the full postgresql:// connection string

# In your local terminal:
DATABASE_URL="postgresql://..." npm run seed
```

---

## Step 7: Test Deployment

Your API will be available at:
```
https://your-app-name.up.railway.app
```

Test endpoints:
```bash
# Health check
curl https://your-app-name.up.railway.app

# Stats endpoint
curl https://your-app-name.up.railway.app/api/inventory/stats

# Login
curl -X POST https://your-app-name.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123"}'
```

---

## Step 8: Update Frontend

Update `Inv-App/src/environments/environment.prod.ts`:

```typescript
export const environment = {
  production: true,
  apiUrl: 'https://your-app-name.up.railway.app/api'
};
```

---

## Railway Configuration Files

### Option A: Create `railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run railway:build"
  },
  "deploy": {
    "startCommand": "npm run railway:start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Option B: Create `nixpacks.toml`

```toml
[phases.setup]
nixPkgs = ["nodejs-18_x"]

[phases.install]
cmds = ["npm install"]

[phases.build]
cmds = [
  "npx prisma generate",
  "npm run build"
]

[start]
cmd = "npx prisma migrate deploy && node dist/src/main"
```

---

## Troubleshooting

### Database Connection Errors

Check that `DATABASE_URL` is set:
1. Railway Dashboard > Your Service > Variables
2. Should see `DATABASE_URL` automatically added by Railway
3. Format: `postgresql://user:password@host:port/database`

### Migrations Fail

Run manually in Railway Shell:
```bash
npx prisma migrate deploy
```

### Port Issues

Railway automatically sets `PORT` environment variable. Update `main.ts`:

```typescript
const port = process.env.PORT || 3000;
await app.listen(port);
```

### Build Timeout

Increase timeout in `railway.json`:
```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run railway:build",
    "watchPatterns": ["src/**"]
  }
}
```

---

## Environment Variables Checklist

Required in Railway:

- [x] `DATABASE_URL` - Auto-set by Railway PostgreSQL
- [x] `JWT_SECRET` - Your secure secret key
- [x] `NODE_ENV` - Set to `production`
- [x] `PORT` - Auto-set by Railway (usually 3000)

---

## Monitoring

### View Logs
Railway Dashboard > Your Service > Deployments > View Logs

### Database Access
Railway Dashboard > PostgreSQL > Connect

Use provided credentials with tools like:
- pgAdmin
- DBeaver
- Prisma Studio (set DATABASE_URL locally)

---

## Costs

Railway Pricing (as of 2024):
- **Hobby Plan:** $5/month
  - $5 credit/month included
  - ~500 hours of usage
  - Good for small apps

- **Pro Plan:** $20/month
  - Better for production

**Your app costs:** ~$5-10/month (backend + database)

---

## Security Best Practices

1. **Change default password** after first seed
2. **Use strong JWT_SECRET** (64+ characters random)
3. **Enable CORS** properly in main.ts:
```typescript
app.enableCors({
  origin: [
    'https://your-frontend.vercel.app',
    'http://localhost:4200' // for development
  ],
  credentials: true
});
```
4. **Set rate limiting** (optional)
5. **Monitor logs** regularly

---

## Next Steps

1. Deploy frontend to Vercel (see VERCEL-DEPLOY.md)
2. Connect frontend to Railway backend
3. Test full application
4. Set up monitoring/alerts
5. Configure custom domain (optional)

---

## Useful Commands

```bash
# View logs
railway logs

# Open dashboard
railway open

# Connect to database
railway connect

# Run commands
railway run npm run seed
```

---

**Questions?** Check Railway docs: https://docs.railway.app
