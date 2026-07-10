import { Module } from "@nestjs/common";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { IngestionService } from "./ingestion.service";
import { ApiFootballProvider } from "./providers/api-football.provider";

// Not imported into AppModule yet — see ingestion.service.ts for why
// (needs a real SPORTS_DATA_API_KEY, which is a pending user decision).
// ApiFootballProvider's constructor doesn't touch the key until a request is
// made, so this module is safe to import once that decision lands; nothing
// else needs to change.
@Module({
  imports: [GameEngineModule],
  providers: [IngestionService, ApiFootballProvider],
  exports: [IngestionService],
})
export class IngestionModule {}
