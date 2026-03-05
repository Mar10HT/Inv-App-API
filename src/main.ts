import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
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

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // Buffer logs until Winston is ready
  });

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
  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || ['http://localhost:4200'];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      if (corsOrigins.some(allowed => origin === allowed || origin.endsWith(allowed.replace('https://', '.')))) {
        return callback(null, true);
      }

      console.log(`CORS blocked origin: ${origin}, allowed: ${corsOrigins.join(', ')}`);
      return callback(null, false);
    },
    credentials: true,
    exposedHeaders: ['set-cookie'],
  }));

  // CSRF protection middleware (after CORS)
  const csrfService = app.get(CsrfService);
  app.use(csrfService.getProtectionMiddleware());

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
  app.useGlobalFilters(new GlobalExceptionFilter(app.get(WINSTON_MODULE_NEST_PROVIDER)));

  // Global logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor(app.get(WINSTON_MODULE_NEST_PROVIDER)));

  // Global prefix for all routes
  app.setGlobalPrefix('api');

  // Swagger API Documentation
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Inventory Management API')
      .setDescription('API for managing inventory, warehouses, suppliers, and transactions')
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
      const adminEmail = process.env.ADMIN_EMAIL || (process.env.NODE_ENV !== 'production' ? 'admin@example.com' : null);
      const adminPassword = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV !== 'production' ? 'password123' : null);

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
        console.log(`[Bootstrap] Initial admin created (${adminEmail})`);
      } else {
        console.warn('[Bootstrap] No users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD env vars to create initial admin.');
      }
    }
  } catch (e) {
    console.error('[Bootstrap] Auto-seed failed:', e.message);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📚 API available at http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📖 API Documentation at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
