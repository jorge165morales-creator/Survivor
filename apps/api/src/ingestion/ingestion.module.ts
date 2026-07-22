import { Module } from "@nestjs/common";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { IngestionService } from "./ingestion.service";
import { IngestionSchedulerService } from "./ingestion-scheduler.service";
import { ApiFootballProvider } from "./providers/api-football.provider";
import { SPORTS_DATA_PROVIDER } from "./providers/sports-data.provider.interface";

@Module({
  imports: [GameEngineModule],
  providers: [
    IngestionService,
    IngestionSchedulerService,
    { provide: SPORTS_DATA_PROVIDER, useClass: ApiFootballProvider },
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
