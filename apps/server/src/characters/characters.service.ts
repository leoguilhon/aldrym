import type { CharacterSummary, InventoryItem, ItemDefinition, Position } from "@aldrym/shared";
import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { compare } from "bcryptjs";

import { isPrismaUniqueConstraintError } from "../prisma/prisma-error.util";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { itemDefinitions } from "../world-state.service";
import { toCharacterSummary } from "./character.mapper";
import { CreateCharacterDto } from "./dto/create-character.dto";
import { DeleteCharacterDto } from "./dto/delete-character.dto";

export class InventoryFullError extends Error {
  constructor() {
    super("Inventory is full");
  }
}

const INVENTORY_SLOT_LIMIT = 10;

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

  async listInventoryForUserCharacter(userId: string, characterId: string): Promise<InventoryItem[]> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);
    return this.listInventoryForCharacter(character.id);
  }

  async addItemToInventoryForUserCharacter(
    userId: string,
    characterId: string,
    item: ItemDefinition,
    quantity: number
  ): Promise<InventoryItem[]> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);
    const normalizedQuantity = Math.max(1, Math.floor(quantity));

    if (item.stackable) {
      const existingItem = await this.prisma.characterItem.findFirst({
        where: {
          characterId: character.id,
          itemKey: item.itemKey
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      if (existingItem) {
        await this.prisma.characterItem.update({
          where: {
            id: existingItem.id
          },
          data: {
            quantity: existingItem.quantity + normalizedQuantity
          }
        });

        return this.listInventoryForCharacter(character.id);
      }
    }

    const occupiedSlots = await this.prisma.characterItem.count({
      where: {
        characterId: character.id
      }
    });

    if (occupiedSlots >= INVENTORY_SLOT_LIMIT) {
      throw new InventoryFullError();
    }

    await this.prisma.characterItem.create({
      data: {
        characterId: character.id,
        itemKey: item.itemKey,
        quantity: normalizedQuantity
      }
    });

    return this.listInventoryForCharacter(character.id);
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

  async savePositionForUserCharacter(userId: string, characterId: string, position: Position): Promise<void> {
    await this.prisma.character.updateMany({
      where: {
        id: characterId,
        userId
      },
      data: {
        x: position.x,
        y: position.y,
        z: position.z
      }
    });
  }

  async addExperienceForUserCharacter(
    userId: string,
    characterId: string,
    gainedExperience: number
  ): Promise<{ character: CharacterSummary; leveledUp: boolean }> {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId
      }
    });

    if (!character) {
      throw new NotFoundException("Character not found");
    }

    let nextLevel = character.level;
    const nextExperience = character.experience + gainedExperience;

    // Temporary MVP balancing: these original thresholds are intentionally simple
    // until combat pacing is tuned around real creatures and progression.
    while (nextExperience >= this.getExperienceRequiredForLevel(nextLevel)) {
      nextLevel += 1;
    }

    const leveledUp = nextLevel > character.level;
    const levelGain = nextLevel - character.level;
    const nextMaxHealth = character.maxHealth + levelGain * 10;
    const nextMaxMana = character.maxMana + levelGain * 5;

    const updatedCharacter = await this.prisma.character.update({
      where: {
        id: character.id
      },
      data: {
        experience: nextExperience,
        level: nextLevel,
        maxHealth: nextMaxHealth,
        maxMana: nextMaxMana,
        health: leveledUp ? nextMaxHealth : character.health,
        mana: leveledUp ? nextMaxMana : character.mana
      }
    });

    return {
      character: toCharacterSummary(updatedCharacter),
      leveledUp
    };
  }

  async applyDamageToUserCharacter(
    userId: string,
    characterId: string,
    damage: number
  ): Promise<CharacterSummary> {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId
      }
    });

    if (!character) {
      throw new NotFoundException("Character not found");
    }

    // Temporary MVP rule: monsters can pressure the player, but player death is
    // intentionally deferred, so health cannot drop below 1 yet.
    const updatedCharacter = await this.prisma.character.update({
      where: {
        id: character.id
      },
      data: {
        health: Math.max(1, character.health - damage)
      }
    });

    return toCharacterSummary(updatedCharacter);
  }

  private getExperienceRequiredForLevel(level: number): number {
    if (level === 1) {
      return 100;
    }

    if (level === 2) {
      return 250;
    }

    return level * level * 100;
  }

  private async findCharacterIdentityForUser(userId: string, characterId: string): Promise<{ id: string }> {
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

    return character;
  }

  private async listInventoryForCharacter(characterId: string): Promise<InventoryItem[]> {
    const items = await this.prisma.characterItem.findMany({
      where: {
        characterId
      },
      orderBy: [
        {
          createdAt: "asc"
        },
        {
          id: "asc"
        }
      ]
    });

    return items.map((item) => {
      const definition = itemDefinitions[item.itemKey] ?? {
        itemKey: item.itemKey,
        name: item.itemKey,
        stackable: false
      };

      return {
        id: item.id,
        itemKey: definition.itemKey,
        name: definition.name,
        stackable: definition.stackable,
        quantity: item.quantity,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString()
      };
    });
  }
}
