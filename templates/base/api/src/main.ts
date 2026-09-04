import 'dotenv/config';
import 'reflect-metadata';
import type { NestApplicationOptions } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
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
  app.enableCors();

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
