import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

// This is the highest-risk piece per the build plan: a full mini-season
// played out through real HTTP requests against the live database,
// verifying win/loss/draw-survival/missed-pick elimination, the
// team-burn constraint, matchday locking, and — the part that matters
// most — that an admin correcting an already-computed result causes the
// recompute engine to converge on the right state rather than drift from
// what a naive "patch in place" approach would produce.
describe("Picks + Survival (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = Date.now();

  let commissionerToken: string;
  let commissionerId: string;
  let bId: string;
  let bToken: string;
  let cId: string;
  let cToken: string;
  let outsiderToken: string;

  let seasonId: string;
  let leagueId: string;
  let md1: string;
  let md2: string;
  let t1: string;
  let t2: string;
  let t3: string;
  let t4: string;
  let fixture1: string;
  let fixture2: string;

  const emails = {
    commish: `e2e-pick-commish-${runId}@example.com`,
    b: `e2e-pick-b-${runId}@example.com`,
    c: `e2e-pick-c-${runId}@example.com`,
    outsider: `e2e-pick-outsider-${runId}@example.com`,
  };

  async function registerAndLogin(email: string, displayName: string) {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/register")
      .send({ email, password: "correct-horse-battery", displayName })
      .expect(201);
    return { token: res.body.accessToken as string, id: res.body.user.id as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
    prisma = app.get(PrismaService);

    const commish = await registerAndLogin(emails.commish, "Commish");
    commissionerToken = commish.token;
    commissionerId = commish.id;
    const b = await registerAndLogin(emails.b, "Bailey");
    bToken = b.token;
    bId = b.id;
    const c = await registerAndLogin(emails.c, "Casey");
    cToken = c.token;
    cId = c.id;
    const outsider = await registerAndLogin(emails.outsider, "Outsider");
    outsiderToken = outsider.token;

    await prisma.user.update({ where: { id: commissionerId }, data: { isAdmin: true } });

    // Dedicated season/teams/matchdays for this test, isolated from the real
    // seeded season — created directly via Prisma since season/team/matchday
    // management isn't exposed over the API in this phase (only fixtures
    // within an existing matchday are, via /admin/fixtures).
    const season = await prisma.season.create({
      data: { name: `E2E Test Season ${runId}`, year: 2099, isActive: false },
    });
    seasonId = season.id;

    const teams = await Promise.all(
      ["T1", "T2", "T3", "T4"].map((name) =>
        prisma.team.create({
          data: { name, shortName: name, externalId: `e2e-${runId}-${name}`, seasons: { connect: { id: season.id } } },
        }),
      ),
    );
    [t1, t2, t3, t4] = teams.map((t) => t.id);

    const future = new Date(Date.now() + 60 * 60 * 1000);
    const [matchday1, matchday2] = await Promise.all([
      prisma.matchday.create({
        data: { seasonId, sequence: 1, type: "GROUP", roundLabel: "MD1", lockAt: future },
      }),
      prisma.matchday.create({
        data: { seasonId, sequence: 2, type: "GROUP", roundLabel: "MD2", lockAt: future },
      }),
    ]);
    md1 = matchday1.id;
    md2 = matchday2.id;

    const league = await request(app.getHttpServer())
      .post("/api/v1/leagues")
      .set("Authorization", `Bearer ${commissionerToken}`)
      .send({ name: "E2E Pick League", seasonId })
      .expect(201);
    leagueId = league.body.id;
    const inviteCode = league.body.inviteCode;

    await request(app.getHttpServer())
      .post("/api/v1/leagues/join")
      .set("Authorization", `Bearer ${bToken}`)
      .send({ inviteCode })
      .expect(200);
    await request(app.getHttpServer())
      .post("/api/v1/leagues/join")
      .set("Authorization", `Bearer ${cToken}`)
      .send({ inviteCode })
      .expect(200);
  });

  afterAll(async () => {
    const userIds = [commissionerId, bId, cId];
    await prisma.usedTeam.deleteMany({ where: { leagueId } });
    await prisma.pick.deleteMany({ where: { leagueId } });
    await prisma.leagueMembership.deleteMany({ where: { leagueId } });
    await prisma.league.deleteMany({ where: { id: leagueId } });
    await prisma.fixture.deleteMany({ where: { matchday: { seasonId } } });
    await prisma.matchday.deleteMany({ where: { seasonId } });
    await prisma.team.deleteMany({ where: { externalId: { startsWith: `e2e-${runId}-` } } });
    await prisma.season.delete({ where: { id: seasonId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { email: emails.outsider } });
    await app.close();
  });

  it("rejects fixture creation from a non-admin", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/admin/fixtures")
      .set("Authorization", `Bearer ${bToken}`)
      .send({ matchdayId: md1, homeTeamId: t1, awayTeamId: t2, kickoffAt: new Date().toISOString() })
      .expect(403);
  });

  it("admin creates fixtures for MD1 and MD2", async () => {
    const f1 = await request(app.getHttpServer())
      .post("/api/v1/admin/fixtures")
      .set("Authorization", `Bearer ${commissionerToken}`)
      .send({ matchdayId: md1, homeTeamId: t1, awayTeamId: t2, kickoffAt: new Date().toISOString() })
      .expect(201);
    fixture1 = f1.body.id;

    const f2 = await request(app.getHttpServer())
      .post("/api/v1/admin/fixtures")
      .set("Authorization", `Bearer ${commissionerToken}`)
      .send({ matchdayId: md2, homeTeamId: t1, awayTeamId: t3, kickoffAt: new Date().toISOString() })
      .expect(201);
    fixture2 = f2.body.id;
  });

  it("pick-options shows the MD1 fixture with no teams used yet", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/leagues/${leagueId}/matchdays/${md1}/pick-options`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .expect(200);

    expect(res.body.fixtures).toHaveLength(1);
    expect(res.body.usedTeamIds).toEqual([]);
    expect(res.body.currentPick).toBeNull();
    expect(res.body.isLocked).toBe(false);
  });

  it("rejects picking a team that isn't playing in this matchday", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/leagues/${leagueId}/matchdays/${md1}/picks`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .send({ teamId: t4 })
      .expect(400);
  });

  it("MD1: commissioner and Casey pick T1, Bailey picks T2", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/leagues/${leagueId}/matchdays/${md1}/picks`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .send({ teamId: t1 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/leagues/${leagueId}/matchdays/${md1}/picks`)
      .set("Authorization", `Bearer ${cToken}`)
      .send({ teamId: t1 })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/leagues/${leagueId}/matchdays/${md1}/picks`)
      .set("Authorization", `Bearer ${bToken}`)
      .send({ teamId: t2 })
      .expect(201);
  });

  it("MD1 result T1 2-0 T2: Bailey is eliminated, commissioner and Casey survive", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/fixtures/${fixture1}/override`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .send({ homeScore: 2, awayScore: 0, status: "FINISHED" })
      .expect(201);

    const standings = await request(app.getHttpServer())
      .get(`/api/v1/leagues/${leagueId}/standings`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .expect(200);

    const byUser = Object.fromEntries(standings.body.entries.map((e: { userId: string }) => [e.userId, e]));
    expect(byUser[commissionerId].status).toBe("ACTIVE");
    expect(byUser[cId].status).toBe("ACTIVE");
    expect(byUser[bId].status).toBe("ELIMINATED");
    expect(byUser[bId].eliminatedAtMatchdaySequence).toBe(1);
  });

  it("blocks the eliminated user from picking MD2", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/leagues/${leagueId}/matchdays/${md2}/picks`)
      .set("Authorization", `Bearer ${bToken}`)
      .send({ teamId: t3 })
      .expect(403);
  });

  it("blocks re-picking a team already used in an earlier matchday", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/leagues/${leagueId}/matchdays/${md2}/picks`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .send({ teamId: t1 })
      .expect(400);
  });

  it("correcting MD1 to a draw un-eliminates Bailey, since a draw always survives", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/admin/fixtures/${fixture1}/override`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .send({ homeScore: 1, awayScore: 1, status: "FINISHED" })
      .expect(201);

    const standings = await request(app.getHttpServer())
      .get(`/api/v1/leagues/${leagueId}/standings`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .expect(200);
    const byUser = Object.fromEntries(standings.body.entries.map((e: { userId: string }) => [e.userId, e]));

    expect(byUser[bId].status).toBe("ACTIVE");
    expect(byUser[commissionerId].status).toBe("ACTIVE");
    expect(byUser[cId].status).toBe("ACTIVE");

    const myPicks = await request(app.getHttpServer())
      .get(`/api/v1/leagues/${leagueId}/picks/me`)
      .set("Authorization", `Bearer ${bToken}`)
      .expect(200);
    expect(myPicks.body.entries).toEqual([
      expect.objectContaining({ matchdaySequence: 1, outcome: "DRAW" }),
    ]);
  });

  it("MD2: all three pick T3 (now unused by everyone), result T1 2-1 T3 eliminates them all", async () => {
    for (const token of [commissionerToken, bToken, cToken]) {
      await request(app.getHttpServer())
        .post(`/api/v1/leagues/${leagueId}/matchdays/${md2}/picks`)
        .set("Authorization", `Bearer ${token}`)
        .send({ teamId: t3 })
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/api/v1/admin/fixtures/${fixture2}/override`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .send({ homeScore: 2, awayScore: 1, status: "FINISHED" })
      .expect(201);

    const standings = await request(app.getHttpServer())
      .get(`/api/v1/leagues/${leagueId}/standings`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .expect(200);
    const byUser = Object.fromEntries(standings.body.entries.map((e: { userId: string }) => [e.userId, e]));

    for (const id of [commissionerId, bId, cId]) {
      expect(byUser[id].status).toBe("ELIMINATED");
      expect(byUser[id].eliminatedAtMatchdaySequence).toBe(2);
    }
  });

  it("a matchday that locked with no pick eliminates a member on the next recompute", async () => {
    // Join BEFORE flipping md1's lockAt into the past: recompute now only
    // holds a member to matchdays that locked after they joined (see
    // recompute.service.ts's eligibility-window handling), so a member who
    // joined after the fact is correctly not judged on a matchday they never
    // had a chance to play — this member needs to have genuinely been around
    // for it and simply never picked.
    const fresh = await registerAndLogin(`e2e-pick-fresh-${runId}@example.com`, "Fresh");
    await request(app.getHttpServer())
      .post("/api/v1/leagues/join")
      .set("Authorization", `Bearer ${fresh.token}`)
      .send({ inviteCode: (await prisma.league.findUniqueOrThrow({ where: { id: leagueId } })).inviteCode })
      .expect(200);

    // Backdate joinedAt well into the past (rather than racing it against
    // "now - 1s" for md1's lockAt below, which flakes depending on how long
    // the requests in between actually take) so there's no ambiguity: this
    // member was clearly already around when md1 locked, and simply never
    // picked it.
    await prisma.leagueMembership.update({
      where: { leagueId_userId: { leagueId, userId: fresh.id } },
      data: { joinedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    // MD1's lockAt was set in the future so the earlier pick-submission
    // tests wouldn't hit MATCHDAY_LOCKED; flip it to the past now so this
    // member (who never picked it) hits the missed-pick rule.
    await prisma.matchday.update({ where: { id: md1 }, data: { lockAt: new Date(Date.now() - 1000) } });

    // Trigger a recompute by re-overriding fixture2 with the same result
    // (idempotent — should still walk every member, including the one who
    // never picked anything).
    await request(app.getHttpServer())
      .post(`/api/v1/admin/fixtures/${fixture2}/override`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .send({ homeScore: 2, awayScore: 1, status: "FINISHED" })
      .expect(201);

    const standings = await request(app.getHttpServer())
      .get(`/api/v1/leagues/${leagueId}/standings`)
      .set("Authorization", `Bearer ${commissionerToken}`)
      .expect(200);
    const entry = standings.body.entries.find((e: { userId: string }) => e.userId === fresh.id);
    expect(entry.status).toBe("ELIMINATED");
    expect(entry.eliminatedAtMatchdaySequence).toBe(1); // md1 has a FINISHED fixture; fresh never picked it

    await prisma.leagueMembership.deleteMany({ where: { leagueId, userId: fresh.id } });
    await prisma.user.delete({ where: { id: fresh.id } });
  });

  it("rejects standings access for a non-member", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/leagues/${leagueId}/standings`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .expect(403);
  });
});
