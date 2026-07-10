import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

// Runs against the real database — see auth.e2e-spec.ts for why. Exercises
// the full commissioner + friend join/leave lifecycle, including the
// DB-enforced maxMembers cap and the "commissioner can't leave" rule.
describe("Leagues (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = Date.now();
  const commissionerEmail = `e2e-league-commish-${runId}@example.com`;
  const friendEmail = `e2e-league-friend-${runId}@example.com`;
  const outsiderEmail = `e2e-league-outsider-${runId}@example.com`;

  let commissionerToken: string;
  let friendToken: string;
  let outsiderToken: string;
  let seasonId: string;

  async function registerAndLogin(email: string, displayName: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "correct-horse-battery", displayName })
      .expect(201);
    return res.body.accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
    prisma = app.get(PrismaService);

    const season = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
    seasonId = season.id;

    commissionerToken = await registerAndLogin(commissionerEmail, "Commissioner");
    friendToken = await registerAndLogin(friendEmail, "Friend");
    outsiderToken = await registerAndLogin(outsiderEmail, "Outsider");
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: [commissionerEmail, friendEmail, outsiderEmail] } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    await prisma.leagueMembership.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.league.deleteMany({ where: { commissionerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it("runs the full create → join → cap → leave lifecycle", async () => {
    const createRes = await request(app.getHttpServer())
      .post("/api/v1/leagues")
      .set("Authorization", `Bearer ${commissionerToken}`)
      .send({ name: "E2E Friends League", seasonId })
      .expect(201);

    expect(createRes.body.memberCount).toBe(1);
    expect(createRes.body.myStatus).toBe("ACTIVE");
    const leagueId = createRes.body.id;
    const inviteCode = createRes.body.inviteCode;

    const mineRes = await request(app.getHttpServer())
      .get("/api/v1/leagues/mine")
      .set("Authorization", `Bearer ${commissionerToken}`)
      .expect(200);
    expect(mineRes.body.some((l: { id: string }) => l.id === leagueId)).toBe(true);

    await request(app.getHttpServer())
      .get(`/api/v1/leagues/${leagueId}`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .expect(403);

    const joinRes = await request(app.getHttpServer())
      .post("/api/v1/leagues/join")
      .set("Authorization", `Bearer ${friendToken}`)
      .send({ inviteCode })
      .expect(200);
    expect(joinRes.body.memberCount).toBe(2);

    await request(app.getHttpServer())
      .post("/api/v1/leagues/join")
      .set("Authorization", `Bearer ${friendToken}`)
      .send({ inviteCode })
      .expect(409);

    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/leagues/${leagueId}`)
      .set("Authorization", `Bearer ${friendToken}`)
      .expect(200);
    expect(detailRes.body.members).toHaveLength(2);

    await request(app.getHttpServer())
      .patch(`/api/v1/leagues/${leagueId}`)
      .set("Authorization", `Bearer ${friendToken}`)
      .send({ maxMembers: 2 })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/leagues/${leagueId}`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .send({ maxMembers: 2 })
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/v1/leagues/join")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ inviteCode })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/leagues/${leagueId}/members/me`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/leagues/${leagueId}/members/me`)
      .set("Authorization", `Bearer ${friendToken}`)
      .expect(204);

    const afterLeaveRes = await request(app.getHttpServer())
      .get(`/api/v1/leagues/${leagueId}`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .expect(200);
    expect(afterLeaveRes.body.members).toHaveLength(1);

    const rejoinRes = await request(app.getHttpServer())
      .post("/api/v1/leagues/join")
      .set("Authorization", `Bearer ${friendToken}`)
      .send({ inviteCode })
      .expect(200);
    expect(rejoinRes.body.memberCount).toBe(2);
  });
});
