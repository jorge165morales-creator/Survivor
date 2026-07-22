import { Module } from "@nestjs/common";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { LeaguesController } from "./leagues.controller";
import { LeaguesService } from "./leagues.service";

@Module({
  imports: [GameEngineModule],
  controllers: [LeaguesController],
  providers: [LeaguesService],
  exports: [LeaguesService],
})
export class LeaguesModule {}
