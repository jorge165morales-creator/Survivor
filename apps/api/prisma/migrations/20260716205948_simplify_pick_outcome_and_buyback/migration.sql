-- Ties now always survive (no more one-tie-forgiven / second-tie-eliminated),
-- so PickOutcome collapses DRAW_FORGIVEN/DRAW_ELIMINATED into a single DRAW.
-- Postgres has no ALTER TYPE ... DROP VALUE, so recreate the enum type.
-- Backfill happens via the USING cast below (mapped through text, so any
-- existing DRAW_FORGIVEN/DRAW_ELIMINATED row would fail the cast — table is
-- empty today, so this is safe; a populated table would need an explicit
-- CASE mapping in the USING clause instead).
CREATE TYPE "PickOutcome_new" AS ENUM ('PENDING', 'WIN', 'DRAW', 'LOSS');
ALTER TABLE "Pick" ALTER COLUMN "outcome" DROP DEFAULT;
ALTER TABLE "Pick" ALTER COLUMN "outcome" TYPE "PickOutcome_new"
  USING ("outcome"::text::"PickOutcome_new");
ALTER TYPE "PickOutcome" RENAME TO "PickOutcome_old";
ALTER TYPE "PickOutcome_new" RENAME TO "PickOutcome";
DROP TYPE "PickOutcome_old";
ALTER TABLE "Pick" ALTER COLUMN "outcome" SET DEFAULT 'PENDING';

-- Replace the automatic one-tie-forgiveness flag with a commissioner-granted,
-- once-per-season buy-back (see LeagueMembership model comment).
ALTER TABLE "LeagueMembership" DROP COLUMN "tieForgivenessUsed";
ALTER TABLE "LeagueMembership" ADD COLUMN "buyBackAvailable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LeagueMembership" ADD COLUMN "buyBackUsed" BOOLEAN NOT NULL DEFAULT false;

-- Per-league toggle: does the commissioner allow buy-backs at all this season.
ALTER TABLE "League" ADD COLUMN "buyBackEnabled" BOOLEAN NOT NULL DEFAULT false;
