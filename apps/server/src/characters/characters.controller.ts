import type { CharacterSummary } from "@aldrym/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/authenticated-user.interface";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CharactersService } from "./characters.service";
import { CreateCharacterDto } from "./dto/create-character.dto";
import { DeleteCharacterDto } from "./dto/delete-character.dto";

@UseGuards(JwtAuthGuard)
@Controller("characters")
export class CharactersController {
  constructor(
    @Inject(CharactersService)
    private readonly charactersService: CharactersService
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createCharacterDto: CreateCharacterDto
  ): Promise<CharacterSummary> {
    return this.charactersService.create(user.id, createCharacterDto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<CharacterSummary[]> {
    return this.charactersService.findAllForUser(user.id);
  }

  @Get(":id")
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") characterId: string
  ): Promise<CharacterSummary> {
    return this.charactersService.findByIdForUser(user.id, characterId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") characterId: string,
    @Body() deleteCharacterDto: DeleteCharacterDto
  ): Promise<void> {
    return this.charactersService.delete(user.id, characterId, deleteCharacterDto);
  }
}
