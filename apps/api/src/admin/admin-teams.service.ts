import { randomUUID } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { AdminTeamDetail } from "@survivor/shared-types";
import { PrismaService } from "../prisma/prisma.service";

function shortNameFor(name: string): string {
  return name.length <= 12 ? name : name.split(" ")[0];
}

@Injectable()
export class AdminTeamsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
