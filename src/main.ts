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
