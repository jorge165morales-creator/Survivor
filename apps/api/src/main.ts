import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  // Native iOS/Android requests aren't subject to CORS, but the Expo web
  // build (and any future admin dashboard) is. CORS_ORIGINS is a
  // comma-separated allowlist for production; unset means allow any origin,
  // which is fine for local dev but must be set before a real deploy.
  const allowedOrigins = process.env.CORS_ORIGINS?.split(",").map((origin) => origin.trim());
  app.enableCors({ origin: allowedOrigins ?? true, credentials: true });
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}
bootstrap();
