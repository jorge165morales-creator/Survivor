-- Lets a team be used again once a player has cycled through every team in
-- the season (see game-engine/team-cycle.ts) — needed for a round-robin
-- competition with more matchdays than teams (e.g. La Liga/Premier League:
-- 38 matchdays, 20 teams), where "never reuse a team" for the whole season
-- would otherwise force elimination by roster exhaustion around matchday 20.

-- Existing rows all predate this feature (no league has ever run long
-- enough to complete a cycle), so backfilling every row to cycle 0 is exact,
-- not a guess.
ALTER TABLE "UsedTeam" ADD COLUMN "cycleIndex" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "UsedTeam_leagueId_userId_teamId_key";

CREATE UNIQUE INDEX "UsedTeam_leagueId_userId_teamId_cycleIndex_key" ON "UsedTeam"("leagueId", "userId", "teamId", "cycleIndex");
