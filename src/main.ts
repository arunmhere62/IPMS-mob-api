import 'tsconfig-paths/register';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
// import { RateLimitInterceptor } from './common/interceptors/rate-limit.interceptor';
import { PerformanceInterceptor } from './common/interceptors/performance.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  console.log('NODE_ENV (runtime) =', process.env.NODE_ENV);
  // Payload size limit for image uploads (50MB - images are compressed on frontend)
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Enable CORS - Allow all origins for development
  app.enableCors({
    origin: true,  // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-organization-id', 'x-pg-location-id'],
    exposedHeaders: ['Authorization'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global exception filter - handles all errors consistently
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global performance interceptor - enables API/DB timings
  app.useGlobalInterceptors(new PerformanceInterceptor());

  // Global response interceptor - wraps all successful responses
  app.useGlobalInterceptors(new TransformInterceptor());

  // Add performance interceptors (temporarily disabled)
  // app.useGlobalInterceptors(new RateLimitInterceptor());

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('PG Management API')
    .setDescription('PG Management System API with OTP Authentication')
    .setVersion('1.0')
    .addTag('auth', 'Authentication endpoints')
    .addTag('health', 'Health check endpoints')
    .addTag('s3', 'S3 file upload/delete endpoints')
    .addTag('location', 'Country/State/City lookup endpoints')
    .addTag('pg-locations', 'PG location management endpoints')
    .addTag('subscription', 'Subscription plans, status, and payments')
    .addTag('organizations', 'Organization management endpoints')
    .addTag('tenants', 'Tenant management and tenant related reporting')
    .addTag('rooms', 'Room management endpoints')
    .addTag('beds', 'Bed management endpoints')
    .addTag('tenant-payments', 'Tenant rent payment endpoints')
    .addTag('advance-payments', 'Advance payment endpoints')
    .addTag('refund-payments', 'Refund payment endpoints')
    .addTag('pending-payments', 'Pending payment and due reminders endpoints')
    .addTag('current-bills', 'Current bills endpoints')
    .addTag('notifications', 'Notification endpoints')
    .addTag('tickets', 'Support ticket endpoints')
    .addTag('employees', 'Employee endpoints')
    .addTag('expenses', 'Expense endpoints')
    .addTag('roles', 'Role management endpoints')
    .addTag('rbac', 'Role-based access control endpoints')
    .addTag('payment-gateway', 'Payment gateway endpoints')
    .addTag('legal-documents', 'Legal documents endpoints')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.PORT || 5000;
  await app.listen(port);
  
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
  console.log(`⚡ Ready for multiple concurrent requests`);
}

bootstrap();
