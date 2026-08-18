import { Controller, ForbiddenException, Headers, Post } from "@nestjs/common";
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
}
