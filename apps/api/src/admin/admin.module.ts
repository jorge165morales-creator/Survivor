import { Module } from "@nestjs/common";
import { GameEngineModule } from "../game-engine/game-engine.module";
import { AdminFixturesController } from "./admin-fixtures.controller";
import { AdminFixturesService } from "./admin-fixtures.service";

@Module({
  imports: [GameEngineModule],
  controllers: [AdminFixturesController],
  providers: [AdminFixturesService],
})
export class AdminModule {}
