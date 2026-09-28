import { Inject, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SPORTS_DATA_PROVIDER, type SportsDataProvider } from "./providers/sports-data.provider.interface";

// getVenue is one request per fixture (Highlightly only has it on the
// per-match detail endpoint, not the list one — see highlightly.provider.ts)
// and shares the same 100/day free-tier budget as season-sync and the live
// poll, so this deliberately only ever looks at the fixtures a player could
// actually be picking soon (still-SCHEDULED, matchday not yet locked) and
// caps how many it spends per run rather than backfilling a whole season's
// worth of already-decided history at once.
const MAX_LOOKUPS_PER_RUN = 30;

export interface VenueBackfillSummary {
  attempted: number;
  filled: number;
}

/**
 * Fills in Fixture.venue for upcoming, not-yet-locked matches that don't
 * have one yet — run daily (see ingestion-scheduler.service.ts) right after
 * fixture discovery, so the stadium shows up on the pick screen without an
 * admin ever having to run the one-off backfillVenue action by hand (see
 * admin-fixtures.service.ts, which this doesn't replace — still useful for
 * an individual fixture an admin wants refreshed immediately).
 */
@Injectable()
export class VenueBackfillService {
  private readonly logger = new Logger(VenueBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SPORTS_DATA_PROVIDER) private readonly provider: SportsDataProvider,
  ) {}

  async backfillUpcomingVenues(): Promise<VenueBackfillSummary> {
    if (!this.provider.getVenue) {
      return { attempted: 0, filled: 0 }; // active provider doesn't support per-fixture venue lookup
    }

    const fixtures = await this.prisma.fixture.findMany({
      where: {
        venue: null,
        status: "SCHEDULED",
        matchday: {
          lockAt: { gt: new Date() },
          season: { isActive: true, isPractice: false },
        },
      },
      // Soonest-to-lock first — those are the fixtures a player is about to
      // pick from, so they're worth the budget before a matchday further out.
      orderBy: { matchday: { lockAt: "asc" } },
      take: MAX_LOOKUPS_PER_RUN,
      select: { id: true, externalId: true },
    });

    let filled = 0;
    for (const fixture of fixtures) {
      try {
        const venue = await this.provider.getVenue(fixture.externalId);
        if (venue) {
          await this.prisma.fixture.update({ where: { id: fixture.id }, data: { venue } });
          filled += 1;
        }
      } catch (err) {
        // Isolated per-fixture — one bad lookup (e.g. a provider hiccup)
        // shouldn't stop the rest of the run.
        this.logger.error(`Venue backfill failed for fixture ${fixture.id}`, err instanceof Error ? err.stack : err);
      }
    }

    return { attempted: fixtures.length, filled };
  }
}
