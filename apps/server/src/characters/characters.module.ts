import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { UsersModule } from "../users/users.module";
import { CharactersController } from "./characters.controller";
import { CharactersService } from "./characters.service";

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [CharactersController],
  providers: [CharactersService]
})
export class CharactersModule {}
