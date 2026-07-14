import type {
  AmmoType,
  CharacterClass,
  CharacterSummary,
  CharacterSkillKey,
  CombatStance,
  ContainerState,
  EquipmentSlot,
  EquipmentSlotState,
  InventoryItem,
  InventoryMoveTarget,
  InventorySlot,
  ItemDefinition,
  Position
} from "@aldrym/shared";
import {
  addSkillProgress,
  equipmentSlots,
  getBaseMaximumHealthForLevel,
  getItemMaxStack,
  getBaseMaximumManaForLevel,
  getLevelFromExperience,
  getMaximumFoodSeconds,
  isItemUsable,
  itemDefinitions
} from "@aldrym/shared";
import { ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { Character, CharacterItem, Prisma } from "@prisma/client";
import { compare } from "bcryptjs";

import { isPrismaUniqueConstraintError } from "../prisma/prisma-error.util";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { toCharacterSummary } from "./character.mapper";
import { CreateCharacterDto } from "./dto/create-character.dto";
import { DeleteCharacterDto } from "./dto/delete-character.dto";

export class InventoryFullError extends Error {
  constructor() {
    super("Inventory is full");
  }
}

export class InventoryValidationError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
  }
}

export interface DroppedCharacterItem extends ItemDefinition {
  quantity: number;
}

const ROOT_LOCATION = "root";
const CONTAINER_LOCATION = "container";
const EQUIPMENT_LOCATION = "equipment";

type InventoryLocation = "root" | "container" | "equipment";
type InventoryTransaction = Prisma.TransactionClient;
type CharacterWithEquipment = Character & { items: Pick<CharacterItem, "equipmentSlot" | "itemKey" | "locationType">[] };
type CharacterIdentity = { id: string; activeWorldSession: boolean; characterClass: CharacterClass };

@Injectable()
export class CharactersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UsersService) private readonly usersService: UsersService
  ) {}

  async create(userId: string, createCharacterDto: CreateCharacterDto): Promise<CharacterSummary> {
    try {
      const maxHealth = getBaseMaximumHealthForLevel(createCharacterDto.characterClass, 1);
      const maxMana = getBaseMaximumManaForLevel(createCharacterDto.characterClass, 1);
      const character = await this.prisma.$transaction(async (tx) => {
        const createdCharacter = await tx.character.create({
          data: {
            userId,
            name: createCharacterDto.name,
            gender: createCharacterDto.gender,
            characterClass: createCharacterDto.characterClass,
            health: maxHealth,
            maxHealth,
            mana: maxMana,
            maxMana
          }
        });

        const equippedBackpack = await tx.characterItem.create({
          data: {
            characterId: createdCharacter.id,
            itemKey: "brown_backpack",
            quantity: 1,
            locationType: EQUIPMENT_LOCATION,
            equipmentSlot: "backpack"
          }
        });

        if (createCharacterDto.characterClass === "hunter") {
          const equippedQuiver = await tx.characterItem.create({
            data: {
              characterId: createdCharacter.id,
              itemKey: "quiver",
              quantity: 1,
              locationType: EQUIPMENT_LOCATION,
              equipmentSlot: "shield"
            }
          });

          await tx.characterItem.createMany({
            data: [
              {
                characterId: createdCharacter.id,
                itemKey: "bow",
                quantity: 1,
                locationType: EQUIPMENT_LOCATION,
                equipmentSlot: "weapon"
              },
              {
                characterId: createdCharacter.id,
                itemKey: "leather_armor",
                quantity: 1,
                locationType: EQUIPMENT_LOCATION,
                equipmentSlot: "body"
              },
              {
                characterId: createdCharacter.id,
                itemKey: "small_health_potion",
                quantity: 5,
                locationType: CONTAINER_LOCATION,
                containerItemId: equippedBackpack.id,
                slotIndex: 0
              },
              {
                characterId: createdCharacter.id,
                itemKey: "small_mana_potion",
                quantity: 5,
                locationType: CONTAINER_LOCATION,
                containerItemId: equippedBackpack.id,
                slotIndex: 1
              },
              {
                characterId: createdCharacter.id,
                itemKey: "crossbow",
                quantity: 1,
                locationType: CONTAINER_LOCATION,
                containerItemId: equippedBackpack.id,
                slotIndex: 2
              },
              {
                characterId: createdCharacter.id,
                itemKey: "bolt",
                quantity: 50,
                locationType: CONTAINER_LOCATION,
                containerItemId: equippedBackpack.id,
                slotIndex: 3
              },
              {
                characterId: createdCharacter.id,
                itemKey: "arrow",
                quantity: 50,
                locationType: CONTAINER_LOCATION,
                containerItemId: equippedQuiver.id,
                slotIndex: 0
              }
            ]
          });
        } else {
          await tx.characterItem.createMany({
            data: [
              {
                characterId: createdCharacter.id,
                itemKey: "dagger",
                quantity: 1,
                locationType: EQUIPMENT_LOCATION,
                equipmentSlot: "weapon"
              },
              {
                characterId: createdCharacter.id,
                itemKey: "leather_armor",
                quantity: 1,
                locationType: EQUIPMENT_LOCATION,
                equipmentSlot: "body"
              },
              {
                characterId: createdCharacter.id,
                itemKey: "wooden_shield",
                quantity: 1,
                locationType: EQUIPMENT_LOCATION,
                equipmentSlot: "shield"
              },
              {
                characterId: createdCharacter.id,
                itemKey: "small_health_potion",
                quantity: 5,
                locationType: CONTAINER_LOCATION,
                containerItemId: equippedBackpack.id,
                slotIndex: 0
              },
              {
                characterId: createdCharacter.id,
                itemKey: "small_mana_potion",
                quantity: 5,
                locationType: CONTAINER_LOCATION,
                containerItemId: equippedBackpack.id,
                slotIndex: 1
              }
            ]
          });
        }

        return createdCharacter;
      });

      return this.findByIdForUser(userId, character.id);
    } catch (error) {
      if (isPrismaUniqueConstraintError(error, "name")) {
        throw new ConflictException("Character name is already taken");
      }

      throw error;
    }
  }

  async findAllForUser(userId: string, stance: CombatStance = "balanced"): Promise<CharacterSummary[]> {
    const characters = await this.prisma.character.findMany({
      include: {
        items: {
          where: {
            locationType: EQUIPMENT_LOCATION
          },
          select: {
            equipmentSlot: true,
            itemKey: true,
            locationType: true
          }
        }
      },
      where: { userId },
      orderBy: { createdAt: "asc" }
    });

    return characters.map((character) => this.toCharacterSummaryWithCombatStats(character, stance));
  }

  async findByIdForUser(
    userId: string,
    characterId: string,
    stance: CombatStance = "balanced"
  ): Promise<CharacterSummary> {
    const character = await this.prisma.character.findFirst({
      include: {
        items: {
          where: {
            locationType: EQUIPMENT_LOCATION
          },
          select: {
            equipmentSlot: true,
            itemKey: true,
            locationType: true
          }
        }
      },
      where: {
        id: characterId,
        userId
      }
    });

    if (!character) {
      throw new NotFoundException("Character not found");
    }

    return this.toCharacterSummaryWithCombatStats(character, stance);
  }

  async listInventoryForUserCharacter(userId: string, characterId: string): Promise<InventorySlot[]> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);
    return this.listEquippedBackpackInventoryForCharacter(character.id);
  }

  async listEquipmentForUserCharacter(userId: string, characterId: string): Promise<EquipmentSlotState[]> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);
    return this.listEquipmentForCharacter(character.id);
  }

  async openContainerForUserCharacter(userId: string, characterId: string, containerItemId: string): Promise<ContainerState> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);
    return this.getContainerState(character.id, containerItemId);
  }

  async addItemToInventoryForUserCharacter(
    userId: string,
    characterId: string,
    item: ItemDefinition,
    quantity: number
  ): Promise<void> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);
    const definition = this.getItemDefinition(item.itemKey);
    const normalizedQuantity = Math.max(1, Math.floor(quantity));

    await this.prisma.$transaction(async (tx) => {
      const equippedBackpack = await this.findEquippedBackpack(tx, character.id);

      if (!equippedBackpack) {
        await this.createEquippedLootItem(tx, character.id, definition, normalizedQuantity);
        return;
      }

      const equippedBackpackDefinition = this.assertContainerItem(equippedBackpack);
      const targetLocation: { locationType: "container"; containerItemId: string; capacity: number } = {
        locationType: CONTAINER_LOCATION,
        containerItemId: equippedBackpack.id,
        capacity: equippedBackpackDefinition.containerSize ?? 0
      };

      await this.storeNewItemInLocation(
        tx,
        character.id,
        definition,
        normalizedQuantity,
        targetLocation.locationType,
        targetLocation.containerItemId,
        targetLocation.capacity
      );
    });
  }

  async addGroundItemToTargetForUserCharacter(
    userId: string,
    characterId: string,
    item: ItemDefinition,
    quantity: number,
    target: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>
  ): Promise<void> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);
    const definition = this.getItemDefinition(item.itemKey);
    const normalizedQuantity = Math.max(1, Math.floor(quantity));

    await this.prisma.$transaction(async (tx) => {
      const createdItem = await tx.characterItem.create({
        data: {
          characterId: character.id,
          itemKey: definition.itemKey,
          quantity: normalizedQuantity,
          locationType: EQUIPMENT_LOCATION,
          equipmentSlot: "backpack",
          containerItemId: null,
          slotIndex: null
        }
      });

      await this.moveItem(tx, character, createdItem, target);
    });
  }

  async moveItemForUserCharacter(
    userId: string,
    characterId: string,
    itemId: string,
    target: InventoryMoveTarget
  ): Promise<void> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);

    await this.prisma.$transaction(async (tx) => {
      const item = await this.getOwnedItem(tx, character.id, itemId);
      await this.moveItem(tx, character, item, target);
    });
  }

  async equipItemForUserCharacter(
    userId: string,
    characterId: string,
    itemId: string,
    requestedSlot?: EquipmentSlot
  ): Promise<void> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);

    await this.prisma.$transaction(async (tx) => {
      const item = await this.getOwnedItem(tx, character.id, itemId);
      const definition = this.getItemDefinition(item.itemKey);
      const equipmentSlot = requestedSlot ?? definition.compatibleEquipmentSlots?.[0];

      if (!equipmentSlot) {
        throw new InventoryValidationError("That item cannot be equipped.", "item_not_equippable");
      }

      await this.moveItem(tx, character, item, {
        locationType: EQUIPMENT_LOCATION,
        equipmentSlot
      });
    });
  }

  async unequipItemForUserCharacter(
    userId: string,
    characterId: string,
    equipmentSlot: EquipmentSlot,
    target?: Extract<InventoryMoveTarget, { locationType: "root" | "container" }>
  ): Promise<void> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.characterItem.findFirst({
        where: {
          characterId: character.id,
          locationType: EQUIPMENT_LOCATION,
          equipmentSlot
        }
      });

      if (!item) {
        throw new InventoryValidationError("There is no item equipped in that slot.", "equipment_slot_empty");
      }

      if (target) {
        await this.moveItem(tx, character, item, target);
        return;
      }

      const equippedBackpack = await this.findEquippedBackpack(tx, character.id);

      if (!equippedBackpack) {
        throw new InventoryFullError();
      }

      await this.moveItem(tx, character, item, {
        locationType: CONTAINER_LOCATION,
        containerItemId: equippedBackpack.id
      });
    });
  }

  async removeItemForGroundDrop(
    userId: string,
    characterId: string,
    itemId: string
  ): Promise<DroppedCharacterItem> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);

    return this.prisma.$transaction(async (tx) => {
      const item = await this.getOwnedItem(tx, character.id, itemId);
      const definition = await this.assertDroppableItem(tx, character.id, item);

      await tx.characterItem.delete({
        where: {
          id: item.id
        }
      });

      return {
        ...definition,
        quantity: item.quantity
      };
    });
  }

  async inspectDroppableItemForUserCharacter(
    userId: string,
    characterId: string,
    itemId: string
  ): Promise<DroppedCharacterItem> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);

    return this.prisma.$transaction(async (tx) => {
      const item = await this.getOwnedItem(tx, character.id, itemId);
      const definition = await this.assertDroppableItem(tx, character.id, item);

      return {
        ...definition,
        quantity: item.quantity
      };
    });
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
        id: true,
        activeWorldSession: true
      }
    });

    if (!character) {
      throw new NotFoundException("Character not found");
    }

    if (character.activeWorldSession) {
      throw new ConflictException("An active world character cannot be deleted");
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

  async activateWorldSessionForUserCharacter(userId: string, characterId: string): Promise<void> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);

    await this.prisma.$transaction([
      this.prisma.character.updateMany({
        where: {
          userId,
          id: {
            not: character.id
          }
        },
        data: {
          activeWorldSession: false
        }
      }),
      this.prisma.character.updateMany({
        where: {
          id: character.id,
          userId
        },
        data: {
          activeWorldSession: true
        }
      })
    ]);
  }

  async finalizeWorldSessionForUserCharacter(userId: string, characterId: string, position: Position): Promise<void> {
    await this.prisma.character.updateMany({
      where: {
        id: characterId,
        userId
      },
      data: {
        activeWorldSession: false,
        x: position.x,
        y: position.y,
        z: position.z
      }
    });
  }

  async clearAllWorldSessions(): Promise<void> {
    await this.prisma.character.updateMany({
      data: {
        activeWorldSession: false
      }
    });
  }

  async findActiveWorldCharacterIdForUser(userId: string): Promise<string | null> {
    const character = await this.prisma.character.findFirst({
      where: {
        userId,
        activeWorldSession: true
      },
      orderBy: {
        updatedAt: "desc"
      },
      select: {
        id: true
      }
    });

    return character?.id ?? null;
  }

  async addExperienceForUserCharacter(
    userId: string,
    characterId: string,
    gainedExperience: number,
    stance: CombatStance = "balanced"
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

    const nextExperience = Math.max(0, character.experience + Math.max(0, Math.floor(gainedExperience)));
    const nextLevel = getLevelFromExperience(nextExperience);
    const leveledUp = nextLevel > character.level;
    const nextMaxHealth = getBaseMaximumHealthForLevel(character.characterClass as CharacterClass, nextLevel);
    const nextMaxMana = getBaseMaximumManaForLevel(character.characterClass as CharacterClass, nextLevel);

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
      character: await this.findByIdForUser(userId, updatedCharacter.id, stance),
      leveledUp
    };
  }

  async applyDamageToUserCharacter(
    userId: string,
    characterId: string,
    damage: number,
    stance: CombatStance = "balanced"
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

    const updatedCharacter = await this.prisma.character.update({
      where: {
        id: character.id
      },
      data: {
        health: Math.max(1, character.health - Math.max(0, Math.floor(damage)))
      }
    });

    return this.findByIdForUser(userId, updatedCharacter.id, stance);
  }

  async regenerateUserCharacter(
    userId: string,
    characterId: string,
    gains: { health: number; mana: number },
    stance: CombatStance = "balanced"
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

    const nextHealth = Math.min(character.maxHealth, character.health + Math.max(0, Math.floor(gains.health)));
    const nextMana = Math.min(character.maxMana, character.mana + Math.max(0, Math.floor(gains.mana)));

    if (nextHealth === character.health && nextMana === character.mana) {
      return this.findByIdForUser(userId, character.id, stance);
    }

    await this.prisma.character.update({
      where: {
        id: character.id
      },
      data: {
        health: nextHealth,
        mana: nextMana
      }
    });

    return this.findByIdForUser(userId, character.id, stance);
  }

  async addSkillProgressForUserCharacter(
    userId: string,
    characterId: string,
    skillKey: CharacterSkillKey,
    gainedPoints: number,
    stance: CombatStance = "balanced"
  ): Promise<CharacterSummary> {
    const normalizedPoints = Math.max(0, Math.floor(gainedPoints));

    if (normalizedPoints === 0) {
      return this.findByIdForUser(userId, characterId, stance);
    }

    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId
      }
    });

    if (!character) {
      throw new NotFoundException("Character not found");
    }

    const skillState = this.getSkillStateFields(character, skillKey);
    const nextSkillState = addSkillProgress(
      character.characterClass as CharacterClass,
      skillKey,
      skillState.level,
      skillState.progress,
      normalizedPoints
    );

    await this.prisma.character.update({
      where: {
        id: character.id
      },
      data: this.createSkillProgressUpdate(skillKey, nextSkillState.level, nextSkillState.currentPoints)
    });

    return this.findByIdForUser(userId, character.id, stance);
  }

  async useItemForUserCharacter(
    userId: string,
    characterId: string,
    itemId: string,
    stance: CombatStance = "balanced"
  ): Promise<{ character: CharacterSummary; message: string }> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);

    const useResult = await this.prisma.$transaction(async (tx) => {
      const ownedItem = await this.getOwnedItem(tx, character.id, itemId);
      const definition = this.getItemDefinition(ownedItem.itemKey);
      const foodSeconds = definition.foodSeconds ?? 0;
      const healthRestore = Math.max(0, definition.healthRestore ?? 0);
      const manaRestore = Math.max(0, definition.manaRestore ?? 0);

      if (!isItemUsable(definition)) {
        throw new InventoryValidationError("That item cannot be used.", "item_not_usable");
      }

      const currentCharacter = await tx.character.findUnique({
        where: {
          id: character.id
        }
      });

      if (!currentCharacter) {
        throw new NotFoundException("Character not found");
      }

      const existingFoodSeconds = currentCharacter.foodExpiresAt
        ? Math.max(0, Math.ceil((currentCharacter.foodExpiresAt.getTime() - Date.now()) / 1000))
        : 0;

      if (foodSeconds > 0 && existingFoodSeconds + foodSeconds > getMaximumFoodSeconds()) {
        throw new InventoryValidationError("You are full.", "character_full");
      }

      const nextHealth = Math.min(currentCharacter.maxHealth, currentCharacter.health + healthRestore);
      const nextMana = Math.min(currentCharacter.maxMana, currentCharacter.mana + manaRestore);
      const healthGain = nextHealth - currentCharacter.health;
      const manaGain = nextMana - currentCharacter.mana;

      if (foodSeconds <= 0 && healthGain <= 0 && manaGain <= 0) {
        if (healthRestore > 0 && manaRestore > 0) {
          throw new InventoryValidationError("Your health and mana are already full.", "resource_full");
        }

        if (healthRestore > 0) {
          throw new InventoryValidationError("Your health is already full.", "health_full");
        }

        if (manaRestore > 0) {
          throw new InventoryValidationError("Your mana is already full.", "mana_full");
        }
      }

      if (ownedItem.quantity > 1) {
        await tx.characterItem.update({
          where: {
            id: ownedItem.id
          },
          data: {
            quantity: ownedItem.quantity - 1
          }
        });
      } else {
        await tx.characterItem.delete({
          where: {
            id: ownedItem.id
          }
        });
      }

      const nextFoodExpiresAt =
        foodSeconds > 0 ? new Date(Date.now() + (existingFoodSeconds + foodSeconds) * 1000) : currentCharacter.foodExpiresAt;

      await tx.character.update({
        where: {
          id: currentCharacter.id
        },
        data: {
          foodExpiresAt: nextFoodExpiresAt,
          health: nextHealth,
          mana: nextMana
        }
      });

      return {
        characterId: currentCharacter.id,
        message: `${foodSeconds > 0 ? "You eat" : "You drink"} the ${definition.name.toLowerCase()}.`
      };
    });

    return {
      character: await this.findByIdForUser(userId, useResult.characterId, stance),
      message: useResult.message
    };
  }

  async consumeAmmoForRangedAttackForUserCharacter(userId: string, characterId: string): Promise<void> {
    const character = await this.findCharacterIdentityForUser(userId, characterId);

    await this.prisma.$transaction(async (tx) => {
      await this.consumeAmmoForRangedAttack(tx, character.id);
    });
  }

  private async moveItem(
    tx: InventoryTransaction,
    character: CharacterIdentity,
    item: CharacterItem,
    target: InventoryMoveTarget
  ): Promise<void> {
    const definition = this.getItemDefinition(item.itemKey);

    if (target.locationType === EQUIPMENT_LOCATION) {
      this.assertKnownEquipmentSlot(target.equipmentSlot);
      this.assertCharacterCanEquipItem(character.characterClass, definition);

      if (!definition.compatibleEquipmentSlots?.includes(target.equipmentSlot)) {
        throw new InventoryValidationError(`${definition.name} cannot be equipped there.`, "invalid_equipment_slot");
      }

      const occupiedItem = await tx.characterItem.findFirst({
        where: {
          characterId: character.id,
          locationType: EQUIPMENT_LOCATION,
          equipmentSlot: target.equipmentSlot,
          id: { not: item.id }
        }
      });

      if (occupiedItem) {
        throw new InventoryValidationError("That equipment slot is already occupied.", "equipment_slot_occupied");
      }

      await tx.characterItem.update({
        where: { id: item.id },
        data: {
          locationType: EQUIPMENT_LOCATION,
          equipmentSlot: target.equipmentSlot,
          containerItemId: null,
          slotIndex: null
        }
      });
      return;
    }

    const targetLocationType = target.locationType;
    const targetContainerItemId = targetLocationType === CONTAINER_LOCATION ? target.containerItemId.trim() : null;
    const capacity = await this.getTargetCapacity(tx, character.id, targetLocationType, targetContainerItemId);

    if (targetLocationType === CONTAINER_LOCATION && targetContainerItemId) {
      await this.assertValidContainerMove(tx, character.id, item, targetContainerItemId);
    }

    const requestedSlotIndex = Number.isInteger(target.slotIndex) ? target.slotIndex : undefined;
    const targetItems = await this.listLocationItems(tx, character.id, targetLocationType, targetContainerItemId, item.id);
    const remainingQuantity = await this.mergeIntoLocationStacks(tx, definition, targetItems, item.quantity);

    if (remainingQuantity <= 0) {
      await tx.characterItem.delete({ where: { id: item.id } });
      return;
    }

    const stackQuantities = this.createStackQuantities(definition, remainingQuantity);
    const allocatedSlots = this.allocateLocationSlots(targetItems, capacity, requestedSlotIndex, stackQuantities.length);

    await tx.characterItem.update({
      where: { id: item.id },
      data: {
        quantity: stackQuantities[0],
        locationType: targetLocationType,
        containerItemId: targetContainerItemId,
        equipmentSlot: null,
        slotIndex: allocatedSlots[0]
      }
    });

    if (stackQuantities.length > 1) {
      await tx.characterItem.createMany({
        data: stackQuantities.slice(1).map((quantity, index) => ({
          characterId: character.id,
          itemKey: definition.itemKey,
          quantity,
          locationType: targetLocationType,
          containerItemId: targetContainerItemId,
          slotIndex: allocatedSlots[index + 1]
        }))
      });
    }
  }

  private async createEquippedLootItem(
    tx: InventoryTransaction,
    characterId: string,
    definition: ItemDefinition,
    quantity: number
  ): Promise<void> {
    const compatibleSlots = definition.compatibleEquipmentSlots ?? [];
    const character = await tx.character.findUnique({
      where: {
        id: characterId
      },
      select: {
        characterClass: true
      }
    });

    if (!character) {
      throw new NotFoundException("Character not found");
    }

    this.assertCharacterCanEquipItem(character.characterClass as CharacterClass, definition);

    for (const equipmentSlot of compatibleSlots) {
      const occupiedItem = await tx.characterItem.findFirst({
        where: {
          characterId,
          locationType: EQUIPMENT_LOCATION,
          equipmentSlot
        }
      });

      if (occupiedItem) {
        continue;
      }

      await tx.characterItem.create({
        data: {
          characterId,
          itemKey: definition.itemKey,
          quantity,
          locationType: EQUIPMENT_LOCATION,
          equipmentSlot,
          containerItemId: null,
          slotIndex: null
        }
      });
      return;
    }

    if (compatibleSlots.length > 0) {
      throw new InventoryValidationError("No compatible equipment slot is available.", "equipment_slot_occupied");
    }

    throw new InventoryValidationError("You need an equipped backpack to carry that item.", "no_equipped_backpack");
  }

  private async assertValidContainerMove(
    tx: InventoryTransaction,
    characterId: string,
    item: CharacterItem,
    targetContainerItemId: string
  ): Promise<void> {
    if (item.id === targetContainerItemId) {
      throw new InventoryValidationError("A container cannot be moved into itself.", "container_self_move");
    }

    let currentContainer = await this.getOwnedItem(tx, characterId, targetContainerItemId);
    const targetContainerDefinition = this.assertContainerItem(currentContainer);
    this.assertItemCanBeStoredInContainer(this.getItemDefinition(item.itemKey), targetContainerDefinition);

    while (currentContainer.containerItemId) {
      if (currentContainer.containerItemId === item.id) {
        throw new InventoryValidationError("A container cannot be moved into one of its own child containers.", "container_nested_move");
      }

      currentContainer = await this.getOwnedItem(tx, characterId, currentContainer.containerItemId);
    }
  }

  private async getTargetCapacity(
    tx: InventoryTransaction,
    characterId: string,
    locationType: "root" | "container",
    containerItemId: string | null
  ): Promise<number> {
    if (locationType === ROOT_LOCATION) {
      throw new InventoryValidationError("Root inventory is not available. Equip a backpack to carry items.", "root_inventory_unavailable");
    }

    if (!containerItemId) {
      throw new InventoryValidationError("A target container id is required.", "invalid_container_id");
    }

    const containerItem = await this.getOwnedItem(tx, characterId, containerItemId);
    const containerDefinition = this.assertContainerItem(containerItem);

    return containerDefinition.containerSize ?? 0;
  }

  private async consumeAmmoForRangedAttack(tx: InventoryTransaction, characterId: string): Promise<void> {
    const weaponItem = await tx.characterItem.findFirst({
      where: {
        characterId,
        locationType: EQUIPMENT_LOCATION,
        equipmentSlot: "weapon"
      }
    });

    if (!weaponItem) {
      return;
    }

    const weaponDefinition = this.getItemDefinition(weaponItem.itemKey);

    if (!weaponDefinition.requiredAmmoType) {
      return;
    }

    const quiverItem = await tx.characterItem.findFirst({
      where: {
        characterId,
        locationType: EQUIPMENT_LOCATION,
        equipmentSlot: "shield"
      }
    });

    if (!quiverItem || quiverItem.itemKey !== "quiver") {
      throw new InventoryValidationError(
        "Equip a quiver in your off-hand before attacking with ranged weapons.",
        "missing_quiver"
      );
    }

    const quiverContents = await tx.characterItem.findMany({
      where: {
        characterId,
        locationType: CONTAINER_LOCATION,
        containerItemId: quiverItem.id
      },
      orderBy: [{ slotIndex: "asc" }, { createdAt: "asc" }, { id: "asc" }]
    });

    const ammoItem = quiverContents.find(
      (containerItem) => this.getItemDefinition(containerItem.itemKey).ammoType === weaponDefinition.requiredAmmoType
    );

    if (!ammoItem) {
      throw new InventoryValidationError(this.getMissingAmmoMessage(weaponDefinition.requiredAmmoType), "no_ammo");
    }

    if (ammoItem.quantity > 1) {
      await tx.characterItem.update({
        where: {
          id: ammoItem.id
        },
        data: {
          quantity: ammoItem.quantity - 1
        }
      });
      return;
    }

    await tx.characterItem.delete({
      where: {
        id: ammoItem.id
      }
    });
  }

  private async storeNewItemInLocation(
    tx: InventoryTransaction,
    characterId: string,
    definition: ItemDefinition,
    quantity: number,
    locationType: "root" | "container",
    containerItemId: string | null,
    capacity: number
  ): Promise<void> {
    const locationItems = await this.listLocationItems(tx, characterId, locationType, containerItemId);
    const remainingQuantity = await this.mergeIntoLocationStacks(tx, definition, locationItems, quantity);

    if (remainingQuantity <= 0) {
      return;
    }

    const stackQuantities = this.createStackQuantities(definition, remainingQuantity);
    const allocatedSlots = this.allocateLocationSlots(locationItems, capacity, undefined, stackQuantities.length);

    await tx.characterItem.createMany({
      data: stackQuantities.map((stackQuantity, index) => ({
        characterId,
        itemKey: definition.itemKey,
        quantity: stackQuantity,
        locationType,
        containerItemId,
        slotIndex: allocatedSlots[index]
      }))
    });
  }

  private async listLocationItems(
    tx: InventoryTransaction,
    characterId: string,
    locationType: "root" | "container",
    containerItemId: string | null,
    excludedItemId?: string
  ): Promise<CharacterItem[]> {
    return tx.characterItem.findMany({
      where: {
        characterId,
        locationType,
        containerItemId,
        ...(excludedItemId ? { id: { not: excludedItemId } } : {})
      },
      orderBy: [{ slotIndex: "asc" }, { createdAt: "asc" }, { id: "asc" }]
    });
  }

  private async mergeIntoLocationStacks(
    tx: InventoryTransaction,
    definition: ItemDefinition,
    locationItems: CharacterItem[],
    quantity: number
  ): Promise<number> {
    if (!definition.stackable) {
      return quantity;
    }

    const maxStack = getItemMaxStack(definition);
    let remainingQuantity = quantity;

    for (const stack of locationItems.filter((locationItem) => locationItem.itemKey === definition.itemKey)) {
      const availableSpace = maxStack === null ? Number.MAX_SAFE_INTEGER : Math.max(0, maxStack - stack.quantity);

      if (availableSpace <= 0) {
        continue;
      }

      const quantityToMerge = Math.min(remainingQuantity, availableSpace);

      await tx.characterItem.update({
        where: {
          id: stack.id
        },
        data: {
          quantity: stack.quantity + quantityToMerge
        }
      });

      remainingQuantity -= quantityToMerge;

      if (remainingQuantity <= 0 || maxStack === null) {
        return Math.max(0, remainingQuantity);
      }
    }

    return remainingQuantity;
  }

  private createStackQuantities(definition: ItemDefinition, quantity: number): number[] {
    if (!definition.stackable) {
      return [quantity];
    }

    const maxStack = getItemMaxStack(definition);

    if (maxStack === null) {
      return [quantity];
    }

    const stackQuantities: number[] = [];
    let remainingQuantity = quantity;

    while (remainingQuantity > 0) {
      const nextQuantity = Math.min(maxStack, remainingQuantity);
      stackQuantities.push(nextQuantity);
      remainingQuantity -= nextQuantity;
    }

    return stackQuantities;
  }

  private allocateLocationSlots(
    locationItems: CharacterItem[],
    capacity: number,
    requestedSlotIndex: number | undefined,
    requiredSlotCount: number
  ): number[] {
    if (requestedSlotIndex !== undefined && (requestedSlotIndex < 0 || requestedSlotIndex >= capacity)) {
      throw new InventoryFullError();
    }

    const occupiedSlotIndexes = new Set(locationItems.map((locationItem) => locationItem.slotIndex).filter((slotIndex) => slotIndex !== null));
    const allocatedSlots: number[] = [];

    if (requestedSlotIndex !== undefined) {
      if (occupiedSlotIndexes.has(requestedSlotIndex)) {
        throw new InventoryValidationError("That slot is already occupied.", "target_slot_occupied");
      }

      allocatedSlots.push(requestedSlotIndex);
      occupiedSlotIndexes.add(requestedSlotIndex);
    }

    for (let slotIndex = 0; slotIndex < capacity && allocatedSlots.length < requiredSlotCount; slotIndex += 1) {
      if (!occupiedSlotIndexes.has(slotIndex)) {
        allocatedSlots.push(slotIndex);
        occupiedSlotIndexes.add(slotIndex);
      }
    }

    if (allocatedSlots.length < requiredSlotCount) {
      throw new InventoryFullError();
    }

    return allocatedSlots;
  }

  private assertCharacterCanEquipItem(characterClass: CharacterClass, definition: ItemDefinition): void {
    if (!definition.compatibleCharacterClasses?.includes(characterClass)) {
      if (definition.compatibleCharacterClasses?.length) {
        throw new InventoryValidationError(
          `${definition.name} can only be equipped by ${definition.compatibleCharacterClasses.join(", ")} characters.`,
          "item_class_restricted"
        );
      }

      return;
    }
  }

  private assertItemCanBeStoredInContainer(itemDefinition: ItemDefinition, containerDefinition: ItemDefinition): void {
    if (containerDefinition.itemKey !== "quiver") {
      return;
    }

    if (!itemDefinition.ammoType) {
      throw new InventoryValidationError("Only arrows and bolts can be stored in a quiver.", "invalid_quiver_item");
    }
  }

  private getMissingAmmoMessage(ammoType: AmmoType): string {
    return ammoType === "arrow" ? "You need arrows in your quiver." : "You need bolts in your quiver.";
  }

  private async findEquippedBackpack(tx: InventoryTransaction, characterId: string): Promise<CharacterItem | null> {
    return tx.characterItem.findFirst({
      where: {
        characterId,
        locationType: EQUIPMENT_LOCATION,
        equipmentSlot: "backpack"
      }
    });
  }

  private async findFreeSlot(
    tx: InventoryTransaction,
    characterId: string,
    locationType: InventoryLocation,
    containerItemId: string | null,
    capacity: number
  ): Promise<number | null> {
    const occupiedItems = await tx.characterItem.findMany({
      where: {
        characterId,
        locationType,
        containerItemId
      },
      select: {
        slotIndex: true
      }
    });
    const occupiedSlotIndexes = new Set(occupiedItems.map((item) => item.slotIndex).filter((slotIndex) => slotIndex !== null));

    for (let slotIndex = 0; slotIndex < capacity; slotIndex += 1) {
      if (!occupiedSlotIndexes.has(slotIndex)) {
        return slotIndex;
      }
    }

    return null;
  }

  private async getOwnedItem(tx: InventoryTransaction, characterId: string, itemId: string): Promise<CharacterItem> {
    const item = await tx.characterItem.findFirst({
      where: {
        id: itemId,
        characterId
      }
    });

    if (!item) {
      throw new InventoryValidationError("That item does not belong to this character.", "item_not_found");
    }

    return item;
  }

  private async assertDroppableItem(
    tx: InventoryTransaction,
    characterId: string,
    item: CharacterItem
  ): Promise<ItemDefinition> {
    const definition = this.getItemDefinition(item.itemKey);

    if (definition.isContainer) {
      const containedItemCount = await tx.characterItem.count({
        where: {
          characterId,
          locationType: CONTAINER_LOCATION,
          containerItemId: item.id
        }
      });

      if (containedItemCount > 0) {
        throw new InventoryValidationError("Empty that container before dropping it.", "container_not_empty");
      }
    }

    return definition;
  }

  private assertContainerItem(item: CharacterItem): ItemDefinition {
    const definition = this.getItemDefinition(item.itemKey);

    if (!definition.isContainer || !definition.containerSize) {
      throw new InventoryValidationError("That item is not a container.", "item_not_container");
    }

    return definition;
  }

  private assertKnownEquipmentSlot(equipmentSlot: EquipmentSlot): void {
    if (!equipmentSlots.includes(equipmentSlot)) {
      throw new InventoryValidationError("That equipment slot does not exist.", "invalid_equipment_slot");
    }
  }

  private createLocationWhere(
    characterId: string,
    locationType: InventoryLocation,
    containerItemId: string | null,
    itemKey: string
  ): Prisma.CharacterItemWhereInput {
    return {
      characterId,
      itemKey,
      locationType,
      containerItemId
    };
  }

  private async listEquippedBackpackInventoryForCharacter(characterId: string): Promise<InventorySlot[]> {
    const equippedBackpack = await this.prisma.characterItem.findFirst({
      where: {
        characterId,
        locationType: EQUIPMENT_LOCATION,
        equipmentSlot: "backpack"
      }
    });

    if (!equippedBackpack) {
      return [];
    }

    const backpackDefinition = this.assertContainerItem(equippedBackpack);
    const items = await this.prisma.characterItem.findMany({
      where: {
        characterId,
        locationType: CONTAINER_LOCATION,
        containerItemId: equippedBackpack.id
      },
      orderBy: [{ slotIndex: "asc" }, { createdAt: "asc" }, { id: "asc" }]
    });

    return this.createSlots(backpackDefinition.containerSize ?? 0, items);
  }

  private async listEquipmentForCharacter(characterId: string): Promise<EquipmentSlotState[]> {
    const items = await this.prisma.characterItem.findMany({
      where: {
        characterId,
        locationType: EQUIPMENT_LOCATION
      },
      orderBy: [{ equipmentSlot: "asc" }, { createdAt: "asc" }]
    });

    return equipmentSlots.map((slot) => ({
      slot,
      item: this.toInventoryItem(items.find((item) => item.equipmentSlot === slot) ?? null)
    }));
  }

  private async getContainerState(characterId: string, containerItemId: string): Promise<ContainerState> {
    const containerItem = await this.prisma.characterItem.findFirst({
      where: {
        id: containerItemId,
        characterId
      }
    });

    if (!containerItem) {
      throw new InventoryValidationError("That container does not belong to this character.", "container_not_found");
    }

    const containerDefinition = this.assertContainerItem(containerItem);
    const items = await this.prisma.characterItem.findMany({
      where: {
        characterId,
        locationType: CONTAINER_LOCATION,
        containerItemId: containerItem.id
      },
      orderBy: [{ slotIndex: "asc" }, { createdAt: "asc" }, { id: "asc" }]
    });

    return {
      container: this.toRequiredInventoryItem(containerItem),
      slots: this.createSlots(containerDefinition.containerSize ?? 0, items)
    };
  }

  private createSlots(capacity: number, items: CharacterItem[]): InventorySlot[] {
    return Array.from({ length: capacity }, (_, slotIndex) => ({
      slotIndex,
      item: this.toInventoryItem(items.find((item) => item.slotIndex === slotIndex) ?? null)
    }));
  }

  private toCharacterSummaryWithCombatStats(
    character: CharacterWithEquipment,
    stance: CombatStance,
    now = Date.now()
  ): CharacterSummary {
    return toCharacterSummary(character, {
      equipmentItems: character.items,
      now,
      stance
    });
  }

  private getItemDefinition(itemKey: string): ItemDefinition {
    return (
      itemDefinitions[itemKey] ?? {
        armor: null,
        attack: null,
        ammoType: null,
        compatibleCharacterClasses: undefined,
        defense: null,
        foodSeconds: null,
        healthRestore: null,
        itemKey,
        maxStack: null,
        name: itemKey,
        requiredAmmoType: null,
        stackable: false,
        itemType: "creature_part",
        isContainer: false,
        containerSize: null,
        manaRestore: null,
        shieldDefenseModifier: null,
        weaponRange: null,
        weaponSkill: null
      }
    );
  }

  private toInventoryItem(item: CharacterItem | null): InventoryItem | null {
    if (!item) {
      return null;
    }

    const definition = this.getItemDefinition(item.itemKey);

    return {
      id: item.id,
      armor: definition.armor,
      attack: definition.attack,
      ammoType: definition.ammoType,
      compatibleCharacterClasses: definition.compatibleCharacterClasses,
      itemKey: definition.itemKey,
      name: definition.name,
      stackable: definition.stackable,
      defense: definition.defense,
      foodSeconds: definition.foodSeconds,
      healthRestore: definition.healthRestore,
      maxStack: definition.maxStack,
      itemType: definition.itemType,
      compatibleEquipmentSlots: definition.compatibleEquipmentSlots,
      isContainer: definition.isContainer,
      containerSize: definition.containerSize,
      manaRestore: definition.manaRestore,
      requiredAmmoType: definition.requiredAmmoType,
      shieldDefenseModifier: definition.shieldDefenseModifier,
      weaponRange: definition.weaponRange,
      weaponSkill: definition.weaponSkill,
      quantity: item.quantity,
      locationType: item.locationType as InventoryLocation,
      slotIndex: item.slotIndex,
      containerItemId: item.containerItemId,
      equipmentSlot: item.equipmentSlot as EquipmentSlot | null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    };
  }

  private toRequiredInventoryItem(item: CharacterItem): InventoryItem {
    return this.toInventoryItem(item) as InventoryItem;
  }

  private getSkillStateFields(character: Character, skillKey: CharacterSkillKey): { level: number; progress: number } {
    switch (skillKey) {
      case "fist":
        return { level: character.fistLevel, progress: character.fistProgress };
      case "sword":
        return { level: character.swordLevel, progress: character.swordProgress };
      case "axe":
        return { level: character.axeLevel, progress: character.axeProgress };
      case "club":
        return { level: character.clubLevel, progress: character.clubProgress };
      case "distance":
        return { level: character.distanceLevel, progress: character.distanceProgress };
      case "shielding":
        return { level: character.shieldingLevel, progress: character.shieldingProgress };
      case "magicLevel":
        return { level: character.magicLevel, progress: character.magicLevelProgress };
      case "fishing":
        return { level: character.fishingLevel, progress: character.fishingProgress };
    }
  }

  private createSkillProgressUpdate(skillKey: CharacterSkillKey, level: number, progress: number): Prisma.CharacterUpdateInput {
    switch (skillKey) {
      case "fist":
        return { fistLevel: level, fistProgress: progress };
      case "sword":
        return { swordLevel: level, swordProgress: progress };
      case "axe":
        return { axeLevel: level, axeProgress: progress };
      case "club":
        return { clubLevel: level, clubProgress: progress };
      case "distance":
        return { distanceLevel: level, distanceProgress: progress };
      case "shielding":
        return { shieldingLevel: level, shieldingProgress: progress };
      case "magicLevel":
        return { magicLevel: level, magicLevelProgress: progress };
      case "fishing":
        return { fishingLevel: level, fishingProgress: progress };
    }
  }

  private async findCharacterIdentityForUser(
    userId: string,
    characterId: string
  ): Promise<CharacterIdentity> {
    const character = await this.prisma.character.findFirst({
      where: {
        id: characterId,
        userId
      },
      select: {
        id: true,
        activeWorldSession: true,
        characterClass: true
      }
    });

    if (!character) {
      throw new NotFoundException("Character not found");
    }

    return {
      ...character,
      characterClass: character.characterClass as CharacterClass
    };
  }
}
