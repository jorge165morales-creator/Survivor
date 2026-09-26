-- CreateEnum
CREATE TYPE "CompetitionStructure" AS ENUM ('GROUP_AND_KNOCKOUT', 'ROUND_ROBIN');

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "structure" "CompetitionStructure" NOT NULL,
    "matchdayCount" INTEGER NOT NULL,
    "highlightlyLeagueId" TEXT,
    "apiFootballLeagueId" TEXT,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Competition_slug_key" ON "Competition"("slug");

-- Seed the one competition every existing Season needs to backfill onto —
-- this app has only ever run the Champions League. highlightlyLeagueId
-- (2486) and apiFootballLeagueId (2) confirmed live against both providers.
INSERT INTO "Competition" ("id", "name", "slug", "structure", "matchdayCount", "highlightlyLeagueId", "apiFootballLeagueId")
VALUES ('00000000-0000-0000-0000-000000000001', 'UEFA Champions League', 'ucl', 'GROUP_AND_KNOCKOUT', 17, '2486', '2');

-- AlterTable: add nullable first so existing rows can be backfilled below,
-- then tighten to NOT NULL once every row has a value.
ALTER TABLE "Season" ADD COLUMN "competitionId" TEXT;

UPDATE "Season" SET "competitionId" = '00000000-0000-0000-0000-000000000001' WHERE "competitionId" IS NULL;

ALTER TABLE "Season" ALTER COLUMN "competitionId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
