import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import cors from 'cors';
import { AppModule } from './app.module';
import { CsrfService } from './csrf/csrf.service';
import { GlobalExceptionFilter } from './common/filters';
import { LoggingInterceptor } from './common/interceptors';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { initSentry } from './common/sentry';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  // Must run before the Nest app is created so Sentry's instrumentation can hook in early.
  initSentry();

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // Buffer logs until Winston is ready
  });

  // Enable graceful shutdown hooks (handles SIGTERM from Railway/K8s)
  app.enableShutdownHooks();

  // Use Winston for NestJS logging
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Trust proxy (Railway, Vercel, etc. use reverse proxies)
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // Security middleware - Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false, // For development
    }),
  );

  // Response compression (GZIP)
  app.use(compression());

  // Cookie parser middleware
  app.use(cookieParser());

  // CORS middleware — must run BEFORE CSRF so all responses (including errors) have CORS headers
  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map((o) =>
    o.trim(),
  ) || ['http://localhost:4200'];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);

        if (
          corsOrigins.some(
            (allowed) =>
              origin === allowed ||
              origin.endsWith(allowed.replace('https://', '.')),
          )
        ) {
          return callback(null, true);
        }

        logger.warn(
          `CORS blocked origin: ${origin}, allowed: ${corsOrigins.join(', ')}`,
        );
        return callback(null, false);
      },
      credentials: true,
      exposedHeaders: ['set-cookie'],
    }),
  );

  // CSRF protection middleware (after CORS)
  // Requests using Bearer token (mobile apps, API clients) are inherently CSRF-immune
  // because browsers never automatically attach Authorization headers cross-site.
  // Login and refresh are also exempt: mobile calls these before having a token,
  // and React Native fetch cannot access HttpOnly Set-Cookie headers to complete
  // the double-submit handshake. These endpoints are safe to exempt because:
  //   - login: no privileged action on behalf of an authenticated user
  //   - refresh: protected by the opaque refresh token value itself
  const csrfService = app.get(CsrfService);
  const CSRF_EXEMPT_PATHS = [
    '/api/auth/login',
    '/api/auth/refresh',
    '/api/auth/register',
    '/api/auth/forgot-password',
  ];
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization as string | undefined;
    if (authHeader?.startsWith('Bearer ')) {
      return next();
    }
    if (CSRF_EXEMPT_PATHS.includes(req.path)) {
      return next();
    }
    return csrfService.getProtectionMiddleware()(req, res, next);
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties that don't have decorators
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties are present
      transform: true, // Transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Auto-convert types
      },
    }),
  );

  // Global exception filter for centralized error handling
  app.useGlobalFilters(
    new GlobalExceptionFilter(app.get(WINSTON_MODULE_NEST_PROVIDER)),
  );

  // Global logging interceptor
  app.useGlobalInterceptors(
    new LoggingInterceptor(app.get(WINSTON_MODULE_NEST_PROVIDER)),
  );

  // Global prefix for all routes
  app.setGlobalPrefix('api');

  // Swagger API Documentation
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Obsid API')
      .setDescription('Obsid — RESTful inventory management API')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('auth_token')
      .addTag('auth', 'Authentication endpoints')
      .addTag('inventory', 'Inventory management')
      .addTag('warehouses', 'Warehouse management')
      .addTag('suppliers', 'Supplier management')
      .addTag('categories', 'Category management')
      .addTag('transactions', 'Transaction management')
      .addTag('loans', 'Loan management')
      .addTag('users', 'User management')
      .addTag('audit', 'Audit logs')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Auto-seed: create initial admin if no users exist (dev only, or via env vars in prod)
  try {
    const prisma = app.get(PrismaService);
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      const adminEmail =
        process.env.ADMIN_EMAIL ||
        (process.env.NODE_ENV !== 'production' ? 'admin@example.com' : null);
      const adminPassword =
        process.env.ADMIN_PASSWORD ||
        (process.env.NODE_ENV !== 'production' ? 'password123' : null);

      if (adminEmail && adminPassword) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        await prisma.user.create({
          data: {
            email: adminEmail,
            password: hashedPassword,
            name: 'System Administrator',
            role: UserRole.SYSTEM_ADMIN,
          },
        });
        logger.log(`Initial admin created (${adminEmail})`);
      } else {
        logger.warn(
          'No users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD env vars to create initial admin.',
        );
      }
    }
  } catch (e) {
    logger.error(`Auto-seed failed: ${e.message}`);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`Server running on http://localhost:${port}`);
  logger.log(`API available at http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`API Documentation at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
