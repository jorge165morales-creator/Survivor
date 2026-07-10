import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

// Runs against a real database (DATABASE_URL from apps/api/.env) rather than a
// mock — auth is security-critical enough that we want the real Prisma
// constraints (unique email) and real bcrypt/JWT round-trips exercised.
// Not part of the default `pnpm test` pipeline (see package.json's separate
// `test:e2e` script) since it needs a reachable Postgres instance, which CI
// doesn't provision yet.
describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const testEmail = `e2e-auth-${Date.now()}@example.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it("registers, rejects a duplicate email, logs in, refreshes, and reads /users/me", async () => {
    const registerRes = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: testEmail, password: "correct-horse-battery", displayName: "E2E Tester" })
      .expect(201);

    expect(registerRes.body.accessToken).toEqual(expect.any(String));
    expect(registerRes.body.refreshToken).toEqual(expect.any(String));
    expect(registerRes.body.user.email).toBe(testEmail);

    await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email: testEmail, password: "another-password", displayName: "Duplicate" })
      .expect(409);

    const loginRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: testEmail, password: "correct-horse-battery" })
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: testEmail, password: "wrong-password" })
      .expect(401);

    const refreshRes = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: loginRes.body.refreshToken })
      .expect(200);

    const meRes = await request(app.getHttpServer())
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${refreshRes.body.accessToken}`)
      .expect(200);

    expect(meRes.body.email).toBe(testEmail);

    await request(app.getHttpServer()).get("/api/v1/users/me").expect(401);
  });
});
