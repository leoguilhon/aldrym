import type { CharacterSummary } from "@aldrym/shared";
import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { compare } from "bcryptjs";

import { isPrismaUniqueConstraintError } from "../prisma/prisma-error.util";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { toCharacterSummary } from "./character.mapper";
import { CreateCharacterDto } from "./dto/create-character.dto";
import { DeleteCharacterDto } from "./dto/delete-character.dto";

@Injectable()
export class CharactersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UsersService) private readonly usersService: UsersService
  ) {}

  async create(userId: string, createCharacterDto: CreateCharacterDto): Promise<CharacterSummary> {
    try {
      const character = await this.prisma.character.create({
        data: {
          userId,
          name: createCharacterDto.name,
          gender: createCharacterDto.gender
        }
      });

      return toCharacterSummary(character);
    } catch (error) {
      if (isPrismaUniqueConstraintError(error, "name")) {
        throw new ConflictException("Character name is already taken");
      }

      throw error;
    }
  }

  async findAllForUser(userId: string): Promise<CharacterSummary[]> {
    const characters = await this.prisma.character.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" }
    });

    return characters.map(toCharacterSummary);
  }

  async findByIdForUser(userId: string, characterId: string): Promise<CharacterSummary> {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId
      }
    });

    if (!character) {
      throw new NotFoundException("Character not found");
    }

    return toCharacterSummary(character);
  }

  async delete(
    userId: string,
    characterId: string,
    deleteCharacterDto: DeleteCharacterDto
  ): Promise<void> {
    const user = await this.usersService.findByIdWithPassword(userId);

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const passwordMatches = await compare(deleteCharacterDto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid password");
    }

    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId
      },
      select: {
        id: true
      }
    });

    if (!character) {
      throw new NotFoundException("Character not found");
    }

    await this.prisma.character.delete({
      where: {
        id: character.id
      }
    });
  }
}
