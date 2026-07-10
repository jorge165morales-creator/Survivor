-- AddForeignKey
ALTER TABLE "LeagueMembership" ADD CONSTRAINT "LeagueMembership_eliminatedAtMatchdayId_fkey" FOREIGN KEY ("eliminatedAtMatchdayId") REFERENCES "Matchday"("id") ON DELETE SET NULL ON UPDATE CASCADE;
