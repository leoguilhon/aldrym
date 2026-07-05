import "reflect-metadata";

import { loadEnvFile } from "node:process";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

function isNodeErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

function loadOptionalEnvFile(): void {
  try {
    loadEnvFile();
  } catch (error) {
    if (!isNodeErrorWithCode(error, "ENOENT")) {
      throw error;
    }
  }
}

loadOptionalEnvFile();

function isAddressInUseError(error: unknown): error is NodeJS.ErrnoException {
  return isNodeErrorWithCode(error, "EADDRINUSE");
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const port = Number(process.env.PORT ?? 41973);

  try {
    await app.listen(port);
  } catch (error) {
    if (isAddressInUseError(error)) {
      console.error(
        `Aldrym server could not start because port ${port} is already in use. Stop the existing server or start this one with a different PORT.`
      );
      await app.close();
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

void bootstrap();
