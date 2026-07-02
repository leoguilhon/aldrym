import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller";
import { RealtimeGateway } from "./realtime.gateway";

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [RealtimeGateway]
})
export class AppModule {}
