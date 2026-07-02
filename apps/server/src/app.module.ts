import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module";
import { CharactersModule } from "./characters/characters.module";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./users/users.module";
import { WorldGateway } from "./world.gateway";
import { WorldStateService } from "./world-state.service";

@Module({
  imports: [PrismaModule, UsersModule, AuthModule, CharactersModule],
  controllers: [HealthController],
  providers: [WorldGateway, WorldStateService]
})
export class AppModule {}
