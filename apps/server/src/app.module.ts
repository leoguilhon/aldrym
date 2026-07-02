import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { CharactersModule } from "./characters/characters.module";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { RealtimeGateway } from "./realtime.gateway";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, CharactersModule],
  controllers: [HealthController],
  providers: [RealtimeGateway]
})
export class AppModule {}
