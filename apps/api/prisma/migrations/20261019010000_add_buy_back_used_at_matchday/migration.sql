ALTER TABLE "LeagueMembership" ADD COLUMN "buyBackUsedAtMatchdayId" TEXT;
ALTER TABLE "LeagueMembership" ADD CONSTRAINT "LeagueMembership_buyBackUsedAtMatchdayId_fkey" FOREIGN KEY ("buyBackUsedAtMatchdayId") REFERENCES "Matchday"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Repair for every membership already affected by the real underlying bug:
-- recompute.service.ts seeds its "has the buy-back been consumed" flag from
-- the persisted buyBackUsed, so once that's true it stays true on every
-- future replay — but with no buyBackUsedAtMatchdayId recorded (this column
-- didn't exist until now), the replay has no way to recognize "this is the
-- SAME matchday I already forgave" and instead re-evaluates that member's
-- original qualifying matchday as a brand-new, unforgivable elimination.
-- Resetting buyBackUsed back to false (buyBackAvailable is untouched — the
-- commissioner's one-time grant is still intact) makes the very next
-- recompute replay the member's history fresh: it finds their actual first
-- qualifying elimination again and forgives it properly this time,
-- correctly recording which matchday via the new column so it stays
-- forgiven on every later replay too. Safe even for a membership that
-- wasn't actually broken (ended up ACTIVE and never hit a second qualifying
-- matchday) — replaying from a fresh forgiveness reaches the exact same
-- conclusion.
UPDATE "LeagueMembership" SET "buyBackUsed" = false WHERE "buyBackUsed" = true AND "buyBackUsedAtMatchdayId" IS NULL;
