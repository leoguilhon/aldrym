import type { CharacterClass, CharacterGender, CharacterSummary } from "@aldrym/shared";
import type { Character } from "@prisma/client";

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
  | "x"
  | "y"
  | "z"
  | "createdAt"
  | "updatedAt"
>;

export function toCharacterSummary(character: CharacterForSummary): CharacterSummary {
  return {
    id: character.id,
    name: character.name,
    gender: character.gender as CharacterGender,
    characterClass: character.characterClass as CharacterClass,
    level: character.level,
    experience: character.experience,
    health: character.health,
    maxHealth: character.maxHealth,
    mana: character.mana,
    maxMana: character.maxMana,
    x: character.x,
    y: character.y,
    z: character.z,
    createdAt: character.createdAt.toISOString(),
    updatedAt: character.updatedAt.toISOString()
  };
}
