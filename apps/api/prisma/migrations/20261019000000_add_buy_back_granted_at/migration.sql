ALTER TABLE "LeagueMembership" ADD COLUMN "buyBackGrantedAt" TIMESTAMP(3);

-- Backfill for grants that already happened before this column existed —
-- without this, every already-affected membership has buyBackUsed = true
-- but buyBackGrantedAt = null, so recompute.service.ts's new blackout-window
-- excuse (which requires a non-null buyBackGrantedAt) could never apply to
-- them and the bug it fixes would stay unfixed for anyone bought back
-- before today. "now()" errs on the side of forgiveness: it treats every
-- already-locked matchday as blackout (excused), so a wrongly-eliminated
-- member flips back to ACTIVE on the next recompute, and only a matchday
-- that locks from this point forward can eliminate them again for real.
UPDATE "LeagueMembership" SET "buyBackGrantedAt" = now() WHERE "buyBackUsed" = true AND "buyBackGrantedAt" IS NULL;
