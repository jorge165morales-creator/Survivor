import { Body, Controller, ForbiddenException, Headers, NotFoundException, Post } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { seedUpcomingSeason, seedHistoricalTestSeason } from "../../prisma/seed";

// TEMPORARY: bootstrap endpoint for when the production database has zero
// seasons (e.g. after a database swap) and no admin account exists yet to
// use the normal guarded admin endpoints. Reuses the exact same seed logic
// as `npm run prisma:seed`, but against this process's own PrismaService
// instead of a standalone script connection, so it can't land in the wrong
// database. Safe to call repeatedly (each seed function no-ops if its
// season already exists). Gated on JWT_SECRET (already-provisioned, known
// only to the operator) rather than left open, since there's no admin
// account yet to gate it on. Remove this controller once a real season
// exists and/or an admin account is set up.
@Controller("admin/bootstrap-season")
export class AdminBootstrapSeasonController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async bootstrap(@Headers("x-bootstrap-secret") secret: string | undefined) {
    if (!secret || secret !== process.env.JWT_SECRET) {
      throw new ForbiddenException("Invalid bootstrap secret");
    }
    await seedUpcomingSeason(this.prisma);
    await seedHistoricalTestSeason(this.prisma);
    const seasons = await this.prisma.season.findMany({
      select: { id: true, name: true, isActive: true },
    });
    return { seasons };
  }

  // Adds one fresh, not-yet-locked matchday+fixture to the historical test
  // season (reusing two of its existing teams), so the App Store review
  // demo league always has something pickable regardless of how stale its
  // original synthetic matchday schedule has gone. Safe to call repeatedly —
  // each call replaces the previous app-review matchday (sequence 99) rather
  // than colliding with it, so it always ends up with exactly one, freshly
  // timed 48h out.
  @Post("add-review-matchday")
  async addReviewMatchday(@Headers("x-bootstrap-secret") secret: string | undefined) {
    if (!secret || secret !== process.env.JWT_SECRET) {
      throw new ForbiddenException("Invalid bootstrap secret");
    }
    const historicalSeason = await this.prisma.season.findFirst({
      where: { isPractice: false, isActive: false },
      orderBy: { year: "desc" },
    });
    if (!historicalSeason) {
      throw new ForbiddenException("No historical test season found");
    }
    const teams = await this.prisma.team.findMany({
      where: { seasons: { some: { id: historicalSeason.id } } },
      take: 2,
    });
    if (teams.length < 2) {
      throw new ForbiddenException("Historical season doesn't have enough teams");
    }
    const [home, away] = teams;
    const lockAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const existing = await this.prisma.matchday.findUnique({
      where: { seasonId_sequence: { seasonId: historicalSeason.id, sequence: 99 } },
    });
    if (existing) {
      await this.prisma.fixture.deleteMany({ where: { matchdayId: existing.id } });
      await this.prisma.matchday.delete({ where: { id: existing.id } });
    }

    const matchday = await this.prisma.matchday.create({
      data: {
        seasonId: historicalSeason.id,
        sequence: 99,
        type: "GROUP",
        roundLabel: "App Review Test Matchday",
        lockAt,
      },
    });
    const fixture = await this.prisma.fixture.create({
      data: {
        matchdayId: matchday.id,
        externalId: `app-review-${Date.now()}`,
        homeTeamId: home.id,
        awayTeamId: away.id,
        kickoffAt: lockAt,
        venue: "Neutral Venue",
        status: "SCHEDULED",
      },
    });

    return { matchday, fixture, home: home.name, away: away.name };
  }

  // Grants isAdmin to an existing account by email, since there's no
  // self-service path yet and the normal admin endpoints (season-sync,
  // fixture overrides) all require one. Safe to call repeatedly.
  @Post("promote-admin")
  async promoteAdmin(
    @Headers("x-bootstrap-secret") secret: string | undefined,
    @Body("email") email: string | undefined,
  ) {
    if (!secret || secret !== process.env.JWT_SECRET) {
      throw new ForbiddenException("Invalid bootstrap secret");
    }
    if (!email) {
      throw new ForbiddenException("email is required");
    }
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException(`No user found with email ${email}`);
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });
    return { id: user.id, email: user.email, isAdmin: true };
  }
}
