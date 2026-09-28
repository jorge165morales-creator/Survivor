import { VenueBackfillService } from "./venue-backfill.service";
import { PrismaService } from "../prisma/prisma.service";
import type { SportsDataProvider } from "./providers/sports-data.provider.interface";

function makePrisma(fixtures: { id: string; externalId: string }[]) {
  const update = jest.fn().mockResolvedValue({});
  return {
    prisma: {
      fixture: {
        findMany: jest.fn().mockResolvedValue(fixtures),
        update,
      },
    } as unknown as PrismaService,
    update,
  };
}

describe("VenueBackfillService.backfillUpcomingVenues", () => {
  it("does nothing when the active provider doesn't support venue lookups", async () => {
    const { prisma } = makePrisma([{ id: "f1", externalId: "ext-1" }]);
    const provider = {} as SportsDataProvider; // no getVenue
    const service = new VenueBackfillService(prisma, provider);

    const summary = await service.backfillUpcomingVenues();

    expect(summary).toEqual({ attempted: 0, filled: 0 });
    expect(prisma.fixture.findMany).not.toHaveBeenCalled();
  });

  it("only queries fixtures that are still SCHEDULED, venue-less, and not yet locked in an active non-practice season", async () => {
    const { prisma } = makePrisma([]);
    const provider = { getVenue: jest.fn() } as unknown as SportsDataProvider;
    const service = new VenueBackfillService(prisma, provider);

    await service.backfillUpcomingVenues();

    expect(prisma.fixture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          venue: null,
          status: "SCHEDULED",
          matchday: {
            lockAt: { gt: expect.any(Date) },
            season: { isActive: true, isPractice: false },
          },
        },
        orderBy: { matchday: { lockAt: "asc" } },
        take: 30,
        select: { id: true, externalId: true },
      }),
    );
  });

  it("fills in the venue for each fixture the provider has one for", async () => {
    const { prisma, update } = makePrisma([
      { id: "f1", externalId: "ext-1" },
      { id: "f2", externalId: "ext-2" },
    ]);
    const provider = {
      getVenue: jest.fn().mockResolvedValueOnce("Santiago Bernabéu, Madrid").mockResolvedValueOnce(null),
    } as unknown as SportsDataProvider;
    const service = new VenueBackfillService(prisma, provider);

    const summary = await service.backfillUpcomingVenues();

    expect(summary).toEqual({ attempted: 2, filled: 1 });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ where: { id: "f1" }, data: { venue: "Santiago Bernabéu, Madrid" } });
  });

  it("isolates one fixture's lookup failure from the rest of the run", async () => {
    const { prisma, update } = makePrisma([
      { id: "f1", externalId: "ext-1" },
      { id: "f2", externalId: "ext-2" },
    ]);
    const provider = {
      getVenue: jest.fn().mockRejectedValueOnce(new Error("Highlightly request failed: 500")).mockResolvedValueOnce("Anfield, Liverpool"),
    } as unknown as SportsDataProvider;
    const service = new VenueBackfillService(prisma, provider);

    const summary = await service.backfillUpcomingVenues();

    expect(summary).toEqual({ attempted: 2, filled: 1 });
    expect(update).toHaveBeenCalledWith({ where: { id: "f2" }, data: { venue: "Anfield, Liverpool" } });
  });
});
