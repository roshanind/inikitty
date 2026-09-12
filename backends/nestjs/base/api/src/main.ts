import 'dotenv/config';
import 'reflect-metadata';
import type { NestApplicationOptions } from '@nestjs/common';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
// @inikitty:inject:imports

async function bootstrap() {
  const appOptions: NestApplicationOptions = {
    // @inikitty:inject:app-options
  };
  const app = await NestFactory.create(AppModule, appOptions);
  // @inikitty:inject:middleware

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  // Lets response DTOs use class-transformer's @Exclude()/@Expose() to control what actually
  // serializes — controllers should return response DTO instances, not raw entities.
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  // `credentials: true` is required for any cookie-based session (Better Auth's) to survive a
  // cross-origin request from the app frontend's own dev server/origin — and per the Fetch spec,
  // a credentialed request needs a literal origin echoed back, not `*`, so `origin: true` (reflect
  // the request's own Origin header) is the permissive default when APP_URL isn't set.
  app.enableCors({ origin: process.env.APP_URL ?? true, credentials: true });

  const config = new DocumentBuilder()
    .setTitle('{{projectName}} API')
    .setDescription('Auto-generated API reference.')
    .setVersion('0.1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`{{projectName}} API listening on http://localhost:${port} (docs at /api/docs)`);
}

void bootstrap();
