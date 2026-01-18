import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  // Cookie parser middleware
  app.use(cookieParser());

  // Enable CORS
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:4200';

  app.enableCors({
    origin: corsOrigin,
    credentials: true,
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
  app.useGlobalFilters(new GlobalExceptionFilter());

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
