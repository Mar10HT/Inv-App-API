// Sentry must be imported first to capture all errors
import './instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import * as Sentry from '@sentry/nestjs';
import { AppModule } from './app.module';
import { CsrfService } from './csrf/csrf.service';
import { GlobalExceptionFilter } from './common/filters';
import { LoggingInterceptor } from './common/interceptors';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // Buffer logs until Winston is ready
  });

  // Use Winston for NestJS logging
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

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

  // Get CSRF service and apply middleware globally
  const csrfService = app.get(CsrfService);
  app.use(csrfService.getProtectionMiddleware());

  // Enable CORS
  const corsOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || ['http://localhost:4200'];

  app.enableCors({
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

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`🚀 Server running on http://localhost:${port}`);
  console.log(`📚 API available at http://localhost:${port}/api`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📖 API Documentation at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
