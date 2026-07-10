import { Module } from "@nestjs/common";
import { RecomputeService } from "./recompute.service";

@Module({
  providers: [RecomputeService],
  exports: [RecomputeService],
})
export class GameEngineModule {}
