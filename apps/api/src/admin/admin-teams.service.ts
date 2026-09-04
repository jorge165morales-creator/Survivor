import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AdminTeamDetail } from "@survivor/shared-types";
import { PrismaService } from "../prisma/prisma.service";

function shortNameFor(name: string): string {
  return name.length <= 12 ? name : name.split(" ")[0];
}

@Injectable()
export class AdminTeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(seasonId: string): Promise<AdminTeamDetail[]> {
    const teams = await this.prisma.team.findMany({
      where: { seasons: { some: { id: seasonId } } },
      orderBy: { name: "asc" },
    });
    return teams;
  }

  async create(
    name: string,
    seasonId: string,
    shortName?: string,
    crestUrl?: string,
    externalId?: string,
  ): Promise<AdminTeamDetail> {
    const season = await this.prisma.season.findUnique({ where: { id: seasonId } });
    if (!season) {
      throw new NotFoundException("Season not found");
    }
    const team = await this.prisma.team.create({
      data: {
        name,
        shortName: shortName ?? shortNameFor(name),
        crestUrl: crestUrl ?? null,
        // Left unset, a manual- prefixed id is generated instead, which can
        // never collide with a real provider id — team-resolution.ts's
        // resolveTeam() then reconciles this row by matching on `name`
        // within the season once a real sync runs, rather than externalId.
        externalId: externalId ?? `manual-${randomUUID()}`,
        seasons: { connect: { id: seasonId } },
      },
    });
    return team;
  }

  // Same reasoning as admin-fixtures.service.ts's delete() — cleaning up a
  // manually-created team that a later real sync name-matched onto a
  // different row instead of reconciling with, leaving this one orphaned.
  // Refuses if anything still actually references it.
  async delete(teamId: string): Promise<void> {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) {
      throw new NotFoundException("Team not found");
    }
    const [fixtureCount, pickCount] = await Promise.all([
      this.prisma.fixture.count({ where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] } }),
      this.prisma.pick.count({ where: { teamId } }),
    ]);
    if (fixtureCount > 0 || pickCount > 0) {
      throw new ConflictException(
        `Cannot delete — ${fixtureCount} fixture(s) and ${pickCount} pick(s) still reference this team`,
      );
    }
    await this.prisma.team.delete({ where: { id: teamId } });
  }
}
