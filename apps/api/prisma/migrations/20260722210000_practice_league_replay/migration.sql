-- AlterTable
ALTER TABLE "Season" ADD COLUMN     "isPractice" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReplayFixtureResult" (
    "id" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "revealAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplayFixtureResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReplayFixtureResult_fixtureId_key" ON "ReplayFixtureResult"("fixtureId");

-- CreateIndex
CREATE INDEX "ReplayFixtureResult_revealAt_idx" ON "ReplayFixtureResult"("revealAt");

-- AddForeignKey
ALTER TABLE "ReplayFixtureResult" ADD CONSTRAINT "ReplayFixtureResult_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

