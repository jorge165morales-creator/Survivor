import { Module } from "@nestjs/common";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { PicksController } from "./picks.controller";
import { PicksService } from "./picks.service";

@Module({
  imports: [GameEngineModule],
  controllers: [PicksController],
  providers: [PicksService],
})
export class PicksModule {}
