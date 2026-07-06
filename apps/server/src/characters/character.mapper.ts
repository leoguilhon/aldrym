import type {
  CharacterClass,
  CharacterFoodState,
  CharacterGender,
  CharacterSkillKey,
  CharacterSkills,
  CharacterSummary,
  CombatStance,
  EquipmentSlot
} from "@aldrym/shared";
import {
  calculateCharacterCombatStats,
  createCharacterFoodState,
  createCharacterSkills,
  itemDefinitions
} from "@aldrym/shared";
import type { Character, CharacterItem } from "@prisma/client";

type CharacterForSummary = Pick<
  Character,
  | "id"
  | "name"
  | "gender"
  | "characterClass"
  | "level"
  | "experience"
  | "health"
  | "maxHealth"
  | "mana"
  | "maxMana"
  | "fistLevel"
  | "fistProgress"
  | "swordLevel"
  | "swordProgress"
  | "axeLevel"
  | "axeProgress"
  | "clubLevel"
  | "clubProgress"
  | "distanceLevel"
  | "distanceProgress"
  | "shieldingLevel"
  | "shieldingProgress"
  | "magicLevel"
  | "magicLevelProgress"
  | "fishingLevel"
  | "fishingProgress"
  | "foodExpiresAt"
  | "x"
  | "y"
  | "z"
  | "createdAt"
  | "updatedAt"
>;

interface CharacterSummaryOptions {
  equipmentItems?: Pick<CharacterItem, "equipmentSlot" | "itemKey" | "locationType">[];
  now?: number;
  stance?: CombatStance;
}

function createSkillLevels(character: CharacterForSummary): Record<CharacterSkillKey, number> {
  return {
    axe: character.axeLevel,
    club: character.clubLevel,
    distance: character.distanceLevel,
    fishing: character.fishingLevel,
    fist: character.fistLevel,
    magicLevel: character.magicLevel,
    shielding: character.shieldingLevel,
    sword: character.swordLevel
  };
}

function createSkillProgress(character: CharacterForSummary): Record<CharacterSkillKey, number> {
  return {
    axe: character.axeProgress,
    club: character.clubProgress,
    distance: character.distanceProgress,
    fishing: character.fishingProgress,
    fist: character.fistProgress,
    magicLevel: character.magicLevelProgress,
    shielding: character.shieldingProgress,
    sword: character.swordProgress
  };
}

function getEquippedItemDefinition(
  equipmentItems: Pick<CharacterItem, "equipmentSlot" | "itemKey" | "locationType">[],
  slot: EquipmentSlot
) {
  const equippedItem = equipmentItems.find((item) => item.locationType === "equipment" && item.equipmentSlot === slot);
  return equippedItem ? itemDefinitions[equippedItem.itemKey] ?? null : null;
}

function createFoodState(character: CharacterForSummary, now: number): CharacterFoodState {
  return createCharacterFoodState(character.foodExpiresAt?.toISOString() ?? null, now);
}

function createSkills(character: CharacterForSummary): CharacterSkills {
  return createCharacterSkills(
    character.characterClass as CharacterClass,
    createSkillLevels(character),
    createSkillProgress(character)
  );
}

export function toCharacterSummary(
  character: CharacterForSummary,
  options: CharacterSummaryOptions = {}
): CharacterSummary {
  const now = options.now ?? Date.now();
  const stance = options.stance ?? "balanced";
  const equipmentItems = options.equipmentItems ?? [];
  const skills = createSkills(character);
  const combatStats = calculateCharacterCombatStats({
    equippedItems: equipmentItems
      .filter((item) => item.locationType === "equipment")
      .map((item) => itemDefinitions[item.itemKey] ?? null),
    level: character.level,
    shield: getEquippedItemDefinition(equipmentItems, "shield"),
    skills,
    stance,
    weapon: getEquippedItemDefinition(equipmentItems, "weapon")
  });

  return {
    combatStats,
    id: character.id,
    food: createFoodState(character, now),
    name: character.name,
    gender: character.gender as CharacterGender,
    characterClass: character.characterClass as CharacterClass,
    level: character.level,
    experience: character.experience,
    health: character.health,
    maxHealth: character.maxHealth,
    mana: character.mana,
    maxMana: character.maxMana,
    skills,
    x: character.x,
    y: character.y,
    z: character.z,
    createdAt: character.createdAt.toISOString(),
    updatedAt: character.updatedAt.toISOString()
  };
}
