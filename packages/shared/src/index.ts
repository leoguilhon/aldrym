export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  activeWorldCharacterId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export type CharacterGender = "male" | "female";

export const characterClasses = ["knight", "druid", "sorcerer", "hunter"] as const;

export type CharacterClass = (typeof characterClasses)[number];

export const weaponCombatSkills = ["fist", "sword", "axe", "club", "distance"] as const;

export type WeaponCombatSkill = (typeof weaponCombatSkills)[number];

export const characterSkillKeys = [
  "fist",
  "club",
  "sword",
  "axe",
  "distance",
  "shielding",
  "magicLevel",
  "fishing"
] as const;

export type CharacterSkillKey = (typeof characterSkillKeys)[number];

export type CombatSkillKey = Exclude<CharacterSkillKey, "magicLevel" | "fishing">;

export const combatStances = ["offensive", "balanced", "defensive"] as const;

export type CombatStance = (typeof combatStances)[number];

export interface CharacterSkillState {
  currentPoints: number;
  level: number;
  pointsForNextLevel: number;
  progressPercent: number;
}

export interface CharacterSkills {
  axe: CharacterSkillState;
  club: CharacterSkillState;
  distance: CharacterSkillState;
  fishing: CharacterSkillState;
  fist: CharacterSkillState;
  magicLevel: CharacterSkillState;
  shielding: CharacterSkillState;
  sword: CharacterSkillState;
}

export interface CharacterFoodState {
  foodExpiresAt: string | null;
  maximumSeconds: number;
  remainingSeconds: number;
}

export interface CharacterCombatStats {
  armorValue: number;
  attackRange: number;
  attackSkill: WeaponCombatSkill;
  attackValue: number;
  defenseSkill: WeaponCombatSkill | "shielding";
  defenseValue: number;
  shieldDefense: number;
  stance: CombatStance;
  weaponAttack: number;
  weaponDefense: number;
}

export interface ItemCombatStats {
  armor: number | null;
  attack: number | null;
  weaponRange: number | null;
  defense: number | null;
  foodSeconds: number | null;
  healthRestore: number | null;
  manaRestore: number | null;
  shieldDefenseModifier: number | null;
  weaponSkill: WeaponCombatSkill | null;
}

const rookieHealthAtLevelOne = 150;
const rookieManaAtLevelOne = 55;
const rookieLevelThreshold = 8;
const rookieHealthPerLevel = 5;
const rookieManaPerLevel = 5;
const maximumFoodSeconds = 1200;
const fistWeaponAttack = 7;

type TibiaClassArchetype = "knight" | "paladin" | "mage";

function getClassArchetype(characterClass: CharacterClass): TibiaClassArchetype {
  switch (characterClass) {
    case "hunter":
      return "paladin";
    case "druid":
    case "sorcerer":
      return "mage";
    default:
      return "knight";
  }
}

function getSkillAdvanceConstant(skillKey: CharacterSkillKey): number {
  switch (skillKey) {
    case "distance":
      return 30;
    case "magicLevel":
      return 1600;
    case "fishing":
      return 20;
    case "shielding":
      return 100;
    default:
      return 50;
  }
}

function getSkillAdvanceMultiplier(characterClass: CharacterClass, skillKey: CharacterSkillKey): number {
  const archetype = getClassArchetype(characterClass);

  if (skillKey === "magicLevel") {
    switch (archetype) {
      case "knight":
        return 3;
      case "paladin":
        return 1.4;
      default:
        return 1.1;
    }
  }

  if (skillKey === "fishing") {
    return 1.1;
  }

  switch (skillKey) {
    case "fist":
      switch (archetype) {
        case "knight":
          return 1.1;
        case "paladin":
          return 1.2;
        default:
          return 1.5;
      }
    case "club":
    case "sword":
    case "axe":
      switch (archetype) {
        case "knight":
          return 1.1;
        case "paladin":
          return 1.2;
        default:
          return 2;
      }
    case "distance":
      switch (archetype) {
        case "paladin":
          return 1.1;
        case "knight":
          return 1.4;
        default:
          return 1.8;
      }
    case "shielding":
      switch (archetype) {
        case "knight":
          return 1.1;
        case "paladin":
          return 1.3;
        default:
          return 1.5;
      }
    default:
      return 1.1;
  }
}

function getSkillAdvanceOffset(skillKey: CharacterSkillKey): number {
  return skillKey === "magicLevel" ? 0 : 10;
}

function getPostRookieHealthGain(characterClass: CharacterClass): number {
  switch (getClassArchetype(characterClass)) {
    case "paladin":
      return 10;
    case "mage":
      return 5;
    default:
      return 15;
  }
}

function getPostRookieManaGain(characterClass: CharacterClass): number {
  switch (getClassArchetype(characterClass)) {
    case "paladin":
      return 15;
    case "mage":
      return 30;
    default:
      return 5;
  }
}

function getRegenerationPerHour(characterClass: CharacterClass): { health: number; mana: number } {
  switch (getClassArchetype(characterClass)) {
    case "paladin":
      return { health: 450, mana: 1800 };
    case "mage":
      return { health: 300, mana: 2400 };
    default:
      return { health: 600, mana: 1200 };
  }
}

export function getMaximumFoodSeconds(): number {
  return maximumFoodSeconds;
}

export function getFistWeaponAttack(): number {
  return fistWeaponAttack;
}

export function getExperienceRequiredForLevel(level: number): number {
  const normalizedLevel = Math.max(1, Math.floor(level));

  if (normalizedLevel <= 1) {
    return 0;
  }

  const previousLevel = normalizedLevel - 1;
  return Math.floor(((50 * previousLevel * previousLevel * previousLevel) - (150 * previousLevel * previousLevel) + (400 * previousLevel)) / 3);
}

export function getExperienceRequiredForNextLevel(level: number): number {
  return getExperienceRequiredForLevel(level + 1);
}

export function getLevelFromExperience(experience: number): number {
  const normalizedExperience = Math.max(0, Math.floor(experience));
  let level = 1;

  while (normalizedExperience >= getExperienceRequiredForNextLevel(level)) {
    level += 1;
  }

  return level;
}

export function getBaseMaximumHealthForLevel(characterClass: CharacterClass, level: number): number {
  const normalizedLevel = Math.max(1, Math.floor(level));

  if (normalizedLevel <= rookieLevelThreshold) {
    return rookieHealthAtLevelOne + (normalizedLevel - 1) * rookieHealthPerLevel;
  }

  const rookieHealth = rookieHealthAtLevelOne + (rookieLevelThreshold - 1) * rookieHealthPerLevel;
  return rookieHealth + (normalizedLevel - rookieLevelThreshold) * getPostRookieHealthGain(characterClass);
}

export function getBaseMaximumManaForLevel(characterClass: CharacterClass, level: number): number {
  const normalizedLevel = Math.max(1, Math.floor(level));

  if (normalizedLevel <= rookieLevelThreshold) {
    return rookieManaAtLevelOne + (normalizedLevel - 1) * rookieManaPerLevel;
  }

  const rookieMana = rookieManaAtLevelOne + (rookieLevelThreshold - 1) * rookieManaPerLevel;
  return rookieMana + (normalizedLevel - rookieLevelThreshold) * getPostRookieManaGain(characterClass);
}

export function getBaseAttackValueFromLevel(level: number): number {
  const normalizedLevel = Math.max(1, Math.floor(level));
  const levelFactor = Math.floor((normalizedLevel + 1000) / 5) + 250;
  const skillFactor = Math.floor((Math.sqrt(levelFactor * 13) + 5) / 10);
  return Math.max(0, levelFactor - 450 + skillFactor);
}

export function getAttackFactorForStance(stance: CombatStance): number {
  switch (stance) {
    case "offensive":
      return 1.2;
    case "defensive":
      return 0.8;
    default:
      return 1;
  }
}

export function getDefenseFactorForStance(stance: CombatStance): number {
  switch (stance) {
    case "offensive":
      return 0.5;
    case "defensive":
      return 1;
    default:
      return 0.7;
  }
}

export function getSkillPointsForNextLevel(
  characterClass: CharacterClass,
  skillKey: CharacterSkillKey,
  currentLevel: number
): number {
  const level = Math.max(getSkillAdvanceOffset(skillKey), Math.floor(currentLevel));
  const advanceConstant = getSkillAdvanceConstant(skillKey);
  const advanceMultiplier = getSkillAdvanceMultiplier(characterClass, skillKey);
  const advanceOffset = getSkillAdvanceOffset(skillKey);
  return Math.max(1, Math.round(advanceConstant * advanceMultiplier ** (level - advanceOffset)));
}

export function createCharacterSkillState(
  characterClass: CharacterClass,
  skillKey: CharacterSkillKey,
  level: number,
  currentPoints: number
): CharacterSkillState {
  const pointsForNextLevel = getSkillPointsForNextLevel(characterClass, skillKey, level);
  const normalizedPoints = Math.max(0, Math.floor(currentPoints));
  const progressPercent = pointsForNextLevel > 0 ? Math.min(100, (normalizedPoints / pointsForNextLevel) * 100) : 0;

  return {
    currentPoints: normalizedPoints,
    level: Math.max(getSkillAdvanceOffset(skillKey), Math.floor(level)),
    pointsForNextLevel,
    progressPercent
  };
}

export function addSkillProgress(
  characterClass: CharacterClass,
  skillKey: CharacterSkillKey,
  level: number,
  currentPoints: number,
  gainedPoints: number
): CharacterSkillState {
  let nextLevel = Math.max(getSkillAdvanceOffset(skillKey), Math.floor(level));
  let nextPoints = Math.max(0, Math.floor(currentPoints)) + Math.max(0, Math.floor(gainedPoints));
  let pointsForNextLevel = getSkillPointsForNextLevel(characterClass, skillKey, nextLevel);

  while (nextPoints >= pointsForNextLevel) {
    nextPoints -= pointsForNextLevel;
    nextLevel += 1;
    pointsForNextLevel = getSkillPointsForNextLevel(characterClass, skillKey, nextLevel);
  }

  return createCharacterSkillState(characterClass, skillKey, nextLevel, nextPoints);
}

export function createCharacterSkills(
  characterClass: CharacterClass,
  levels: Record<CharacterSkillKey, number>,
  progress: Record<CharacterSkillKey, number>
): CharacterSkills {
  return {
    axe: createCharacterSkillState(characterClass, "axe", levels.axe, progress.axe),
    club: createCharacterSkillState(characterClass, "club", levels.club, progress.club),
    distance: createCharacterSkillState(characterClass, "distance", levels.distance, progress.distance),
    fishing: createCharacterSkillState(characterClass, "fishing", levels.fishing, progress.fishing),
    fist: createCharacterSkillState(characterClass, "fist", levels.fist, progress.fist),
    magicLevel: createCharacterSkillState(characterClass, "magicLevel", levels.magicLevel, progress.magicLevel),
    shielding: createCharacterSkillState(characterClass, "shielding", levels.shielding, progress.shielding),
    sword: createCharacterSkillState(characterClass, "sword", levels.sword, progress.sword)
  };
}

export function getRemainingFoodSeconds(foodExpiresAt: string | null | undefined, now = Date.now()): number {
  if (!foodExpiresAt) {
    return 0;
  }

  const expiresAtMs = Date.parse(foodExpiresAt);

  if (!Number.isFinite(expiresAtMs)) {
    return 0;
  }

  return Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
}

export function createCharacterFoodState(foodExpiresAt: string | null | undefined, now = Date.now()): CharacterFoodState {
  return {
    foodExpiresAt: foodExpiresAt ?? null,
    maximumSeconds: maximumFoodSeconds,
    remainingSeconds: getRemainingFoodSeconds(foodExpiresAt, now)
  };
}

export function getWeaponCombatSkill(item: Pick<ItemCombatStats, "weaponSkill"> | null | undefined): WeaponCombatSkill {
  return item?.weaponSkill ?? "fist";
}

export function getWeaponAttack(item: Pick<ItemCombatStats, "attack"> | null | undefined): number {
  return Math.max(0, item?.attack ?? fistWeaponAttack);
}

export function getWeaponDefense(item: Pick<ItemCombatStats, "defense"> | null | undefined): number {
  return Math.max(0, item?.defense ?? 0);
}

export function getWeaponRange(item: Pick<ItemCombatStats, "weaponRange"> | null | undefined): number {
  return Math.max(1, item?.weaponRange ?? 1);
}

export function getShieldDefense(item: Pick<ItemCombatStats, "defense"> | null | undefined): number {
  return Math.max(0, item?.defense ?? 0);
}

export function getTotalArmorValue(items: Array<Pick<ItemCombatStats, "armor"> | null | undefined>): number {
  return items.reduce((total, item) => total + Math.max(0, item?.armor ?? 0), 0);
}

export function calculateAttackValue(options: {
  attack: number;
  level: number;
  skillLevel: number;
  stance: CombatStance;
}): number {
  const baseDamage = getBaseAttackValueFromLevel(options.level);
  const stanceAdjustedAttack = Math.floor(options.attack * getAttackFactorForStance(options.stance));
  const skillTerm = (options.skillLevel + 4) / 28;
  return Math.max(0, Math.floor(baseDamage + stanceAdjustedAttack * skillTerm));
}

export function calculateDefenseValue(options: {
  defense: number;
  skillLevel: number;
  stance: CombatStance;
}): number {
  const skillTerm = (options.skillLevel + 8) / 40;
  return Math.max(0, Math.floor(options.defense * skillTerm * getDefenseFactorForStance(options.stance)));
}

export function calculateCharacterCombatStats(options: {
  equippedItems: Array<Pick<ItemCombatStats, "armor"> | null | undefined>;
  level: number;
  shield?: Pick<ItemCombatStats, "defense"> | null;
  skills: CharacterSkills;
  stance: CombatStance;
  weapon?: Pick<ItemCombatStats, "attack" | "defense" | "shieldDefenseModifier" | "weaponRange" | "weaponSkill"> | null;
}): CharacterCombatStats {
  const attackSkill = getWeaponCombatSkill(options.weapon);
  const weaponAttack = getWeaponAttack(options.weapon);
  const weaponDefense = getWeaponDefense(options.weapon);
  const attackRange = getWeaponRange(options.weapon);
  const shieldDefense = getShieldDefense(options.shield);
  const defenseSkill = shieldDefense > 0 ? "shielding" : attackSkill;
  const baseDefense =
    shieldDefense > 0
      ? shieldDefense + Math.max(0, options.weapon?.shieldDefenseModifier ?? 0)
      : weaponDefense;

  return {
    armorValue: getTotalArmorValue(options.equippedItems),
    attackRange,
    attackSkill,
    attackValue: calculateAttackValue({
      attack: weaponAttack,
      level: options.level,
      skillLevel: options.skills[attackSkill].level,
      stance: options.stance
    }),
    defenseSkill,
    defenseValue: calculateDefenseValue({
      defense: baseDefense,
      skillLevel: options.skills[defenseSkill].level,
      stance: options.stance
    }),
    shieldDefense,
    stance: options.stance,
    weaponAttack,
    weaponDefense
  };
}

export function getRegenerationPerSecond(characterClass: CharacterClass): { health: number; mana: number } {
  const regeneration = getRegenerationPerHour(characterClass);
  return {
    health: regeneration.health / 3600,
    mana: regeneration.mana / 3600
  };
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface CreateCharacterRequest {
  name: string;
  gender: CharacterGender;
  characterClass: CharacterClass;
}

export interface DeleteCharacterRequest {
  password: string;
}

export interface CharacterSummary extends Position {
  combatStats: CharacterCombatStats;
  id: string;
  food: CharacterFoodState;
  name: string;
  gender: CharacterGender;
  characterClass: CharacterClass;
  level: number;
  experience: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  skills: CharacterSkills;
  createdAt: string;
  updatedAt: string;
}

export const moveDirections = ["up", "down", "left", "right", "up-left", "up-right", "down-left", "down-right"] as const;

export type MoveDirection = (typeof moveDirections)[number];

const baseMovementCooldownMs = 700;
const diagonalMovementCooldownMultiplier = 1.4;
const movementCooldownReductionPerLevelMs = 20;
const minimumMovementCooldownMs = 350;
const movementTweenCompletionBufferMs = 45;
const minimumMovementTweenDurationMs = 280;
const maximumMovementTweenDurationMs = 900;

export function isDiagonalMoveDirection(direction: MoveDirection): boolean {
  return direction === "up-left" || direction === "up-right" || direction === "down-left" || direction === "down-right";
}

export function getMovementCooldownMs(level: number, direction?: MoveDirection): number {
  const normalizedLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  const cooldownMs = baseMovementCooldownMs - (normalizedLevel - 1) * movementCooldownReductionPerLevelMs;
  const cappedCooldownMs = Math.max(minimumMovementCooldownMs, cooldownMs);

  return direction && isDiagonalMoveDirection(direction)
    ? Math.round(cappedCooldownMs * diagonalMovementCooldownMultiplier)
    : cappedCooldownMs;
}

export function getMovementTweenDurationMs(level: number, direction?: MoveDirection): number {
  const durationMs = getMovementCooldownMs(level, direction) - movementTweenCompletionBufferMs;

  return Math.min(maximumMovementTweenDurationMs, Math.max(minimumMovementTweenDurationMs, durationMs));
}

export type LocalTileType = "grass" | "dirt" | "stone" | "water" | "wall";

export interface LocalMapData {
  width: number;
  height: number;
  tileSize: number;
  defaultSpawn: Position;
  protectionZones: Array<{ x: number; y: number; width: number; height: number; z: number }>;
  tiles: LocalTileType[][];
}

export const cardinalDirections = ["south", "north", "east", "west"] as const;
export type CardinalDirection = (typeof cardinalDirections)[number];

export const chaseModes = ["stand", "follow"] as const;
export type ChaseMode = (typeof chaseModes)[number];

export interface WorldPlayer extends Position {
  characterId: string;
  characterClass: CharacterClass;
  name: string;
  level: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  facing: CardinalDirection;
  isInBattleMode: boolean;
}

export type MonsterType = "rat" | "troll";

export interface WorldMonster extends Position {
  armor: number;
  id: string;
  type: MonsterType;
  name: string;
  level: number;
  health: number;
  maxHealth: number;
  maxDamage: number;
  experienceReward: number;
  alive: boolean;
  respawnMs: number;
  respawnDueAt: number | null;
  retreatAtHealth: number | null;
  spawnX: number;
  spawnY: number;
  spawnZ: number;
}

export type AmmoType = "arrow" | "bolt";

export type ItemType = "ammo" | "armor" | "container" | "consumable" | "creature_part" | "currency" | "shield" | "weapon";

export const equipmentSlots = [
  "necklace",
  "head",
  "backpack",
  "weapon",
  "body",
  "shield",
  "ring",
  "legs",
  "trinket",
  "feet"
] as const;

export type EquipmentSlot = (typeof equipmentSlots)[number];

export type InventoryLocationType = "root" | "container" | "equipment";

export interface ItemDefinition {
  armor: number | null;
  attack: number | null;
  ammoType: AmmoType | null;
  compatibleCharacterClasses?: CharacterClass[];
  itemKey: string;
  name: string;
  stackable: boolean;
  defense: number | null;
  foodSeconds: number | null;
  healthRestore: number | null;
  manaRestore: number | null;
  maxStack: number | null;
  itemType: ItemType;
  compatibleEquipmentSlots?: EquipmentSlot[];
  isContainer: boolean;
  containerSize: number | null;
  requiredAmmoType: AmmoType | null;
  shieldDefenseModifier: number | null;
  weaponRange: number | null;
  weaponSkill: WeaponCombatSkill | null;
}

export function isItemUsable(item: Pick<ItemDefinition, "foodSeconds" | "healthRestore" | "manaRestore"> | null | undefined): boolean {
  return Math.max(0, item?.foodSeconds ?? 0, item?.healthRestore ?? 0, item?.manaRestore ?? 0) > 0;
}

export function getItemMaxStack(item: Pick<ItemDefinition, "maxStack" | "stackable"> | null | undefined): number | null {
  if (!item?.stackable) {
    return 1;
  }

  return item.maxStack ?? null;
}

export const itemDefinitions: Record<string, ItemDefinition> = {
  gold_coin: {
    armor: null,
    attack: null,
    ammoType: null,
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: null,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "gold_coin",
    itemType: "currency",
    maxStack: 100,
    manaRestore: null,
    name: "Gold Coin",
    requiredAmmoType: null,
    shieldDefenseModifier: null,
    stackable: true,
    weaponRange: null,
    weaponSkill: null
  },
  arrow: {
    armor: null,
    attack: null,
    ammoType: "arrow",
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: null,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "arrow",
    itemType: "ammo",
    maxStack: 100,
    manaRestore: null,
    name: "Arrow",
    requiredAmmoType: null,
    shieldDefenseModifier: null,
    stackable: true,
    weaponRange: null,
    weaponSkill: null
  },
  dagger: {
    armor: null,
    attack: 10,
    ammoType: null,
    compatibleEquipmentSlots: ["weapon"],
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: 6,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "dagger",
    itemType: "weapon",
    maxStack: null,
    manaRestore: null,
    name: "Dagger",
    requiredAmmoType: null,
    shieldDefenseModifier: 0,
    stackable: false,
    weaponRange: 1,
    weaponSkill: "sword"
  },
  bolt: {
    armor: null,
    attack: null,
    ammoType: "bolt",
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: null,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "bolt",
    itemType: "ammo",
    maxStack: 100,
    manaRestore: null,
    name: "Bolt",
    requiredAmmoType: null,
    shieldDefenseModifier: null,
    stackable: true,
    weaponRange: null,
    weaponSkill: null
  },
  bow: {
    armor: null,
    attack: 12,
    ammoType: null,
    compatibleCharacterClasses: ["hunter"],
    compatibleEquipmentSlots: ["weapon"],
    containerSize: null,
    defense: 4,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "bow",
    itemType: "weapon",
    maxStack: null,
    manaRestore: null,
    name: "Bow",
    requiredAmmoType: "arrow",
    shieldDefenseModifier: 0,
    stackable: false,
    weaponRange: 5,
    weaponSkill: "distance"
  },
  small_axe: {
    armor: null,
    attack: 10,
    ammoType: null,
    compatibleEquipmentSlots: ["weapon"],
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: 5,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "small_axe",
    itemType: "weapon",
    maxStack: null,
    manaRestore: null,
    name: "Small Axe",
    requiredAmmoType: null,
    shieldDefenseModifier: 0,
    stackable: false,
    weaponRange: 1,
    weaponSkill: "axe"
  },
  crossbow: {
    armor: null,
    attack: 14,
    ammoType: null,
    compatibleCharacterClasses: ["hunter"],
    compatibleEquipmentSlots: ["weapon"],
    containerSize: null,
    defense: 3,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "crossbow",
    itemType: "weapon",
    maxStack: null,
    manaRestore: null,
    name: "Crossbow",
    requiredAmmoType: "bolt",
    shieldDefenseModifier: 0,
    stackable: false,
    weaponRange: 5,
    weaponSkill: "distance"
  },
  wooden_club: {
    armor: null,
    attack: 10,
    ammoType: null,
    compatibleEquipmentSlots: ["weapon"],
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: 5,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "wooden_club",
    itemType: "weapon",
    maxStack: null,
    manaRestore: null,
    name: "Wooden Club",
    requiredAmmoType: null,
    shieldDefenseModifier: 0,
    stackable: false,
    weaponRange: 1,
    weaponSkill: "club"
  },
  brown_backpack: {
    armor: null,
    attack: null,
    ammoType: null,
    compatibleEquipmentSlots: ["backpack"],
    containerSize: 20,
    compatibleCharacterClasses: undefined,
    defense: null,
    foodSeconds: null,
    healthRestore: null,
    isContainer: true,
    itemKey: "brown_backpack",
    itemType: "container",
    maxStack: null,
    manaRestore: null,
    name: "Brown Backpack",
    requiredAmmoType: null,
    shieldDefenseModifier: null,
    stackable: false,
    weaponRange: null,
    weaponSkill: null
  },
  quiver: {
    armor: null,
    attack: null,
    ammoType: null,
    compatibleCharacterClasses: ["hunter"],
    compatibleEquipmentSlots: ["shield"],
    containerSize: 8,
    defense: null,
    foodSeconds: null,
    healthRestore: null,
    isContainer: true,
    itemKey: "quiver",
    itemType: "container",
    maxStack: null,
    manaRestore: null,
    name: "Quiver",
    requiredAmmoType: null,
    shieldDefenseModifier: null,
    stackable: false,
    weaponRange: null,
    weaponSkill: null
  },
  wooden_shield: {
    armor: null,
    attack: null,
    ammoType: null,
    compatibleEquipmentSlots: ["shield"],
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: 11,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "wooden_shield",
    itemType: "shield",
    maxStack: null,
    manaRestore: null,
    name: "Wooden Shield",
    requiredAmmoType: null,
    shieldDefenseModifier: null,
    stackable: false,
    weaponRange: null,
    weaponSkill: null
  },
  leather_armor: {
    armor: 3,
    attack: null,
    ammoType: null,
    compatibleEquipmentSlots: ["body"],
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: null,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "leather_armor",
    itemType: "armor",
    maxStack: null,
    manaRestore: null,
    name: "Leather Armor",
    requiredAmmoType: null,
    shieldDefenseModifier: null,
    stackable: false,
    weaponRange: null,
    weaponSkill: null
  },
  leather_helmet: {
    armor: 1,
    attack: null,
    ammoType: null,
    compatibleEquipmentSlots: ["head"],
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: null,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "leather_helmet",
    itemType: "armor",
    maxStack: null,
    manaRestore: null,
    name: "Leather Helmet",
    requiredAmmoType: null,
    shieldDefenseModifier: null,
    stackable: false,
    weaponRange: null,
    weaponSkill: null
  },
  leather_legs: {
    armor: 2,
    attack: null,
    ammoType: null,
    compatibleEquipmentSlots: ["legs"],
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: null,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "leather_legs",
    itemType: "armor",
    maxStack: null,
    manaRestore: null,
    name: "Leather Legs",
    requiredAmmoType: null,
    shieldDefenseModifier: null,
    stackable: false,
    weaponRange: null,
    weaponSkill: null
  },
  leather_boots: {
    armor: 1,
    attack: null,
    ammoType: null,
    compatibleEquipmentSlots: ["feet"],
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: null,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "leather_boots",
    itemType: "armor",
    maxStack: null,
    manaRestore: null,
    name: "Leather Boots",
    requiredAmmoType: null,
    shieldDefenseModifier: null,
    stackable: false,
    weaponRange: null,
    weaponSkill: null
  },
  meat: {
    armor: null,
    attack: null,
    ammoType: null,
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: null,
    foodSeconds: 180,
    healthRestore: null,
    isContainer: false,
    itemKey: "meat",
    itemType: "consumable",
    maxStack: null,
    manaRestore: null,
    name: "Meat",
    requiredAmmoType: null,
    shieldDefenseModifier: null,
    stackable: true,
    weaponRange: null,
    weaponSkill: null
  },
  small_health_potion: {
    armor: null,
    attack: null,
    ammoType: null,
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: null,
    foodSeconds: null,
    healthRestore: 30,
    isContainer: false,
    itemKey: "small_health_potion",
    itemType: "consumable",
    maxStack: null,
    manaRestore: null,
    name: "Small Health Potion",
    requiredAmmoType: null,
    shieldDefenseModifier: null,
    stackable: true,
    weaponRange: null,
    weaponSkill: null
  },
  small_mana_potion: {
    armor: null,
    attack: null,
    ammoType: null,
    containerSize: null,
    compatibleCharacterClasses: undefined,
    defense: null,
    foodSeconds: null,
    healthRestore: null,
    isContainer: false,
    itemKey: "small_mana_potion",
    itemType: "consumable",
    maxStack: null,
    manaRestore: 20,
    name: "Small Mana Potion",
    requiredAmmoType: null,
    shieldDefenseModifier: null,
    stackable: true,
    weaponRange: null,
    weaponSkill: null
  }
};

export interface InventoryItem extends ItemDefinition {
  id: string;
  quantity: number;
  locationType: InventoryLocationType;
  slotIndex: number | null;
  containerItemId: string | null;
  equipmentSlot: EquipmentSlot | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventorySlot {
  slotIndex: number;
  item: InventoryItem | null;
}

export interface EquipmentSlotState {
  slot: EquipmentSlot;
  item: InventoryItem | null;
}

export interface ContainerState {
  container: InventoryItem;
  slots: InventorySlot[];
}

export interface CorpseItem extends ItemDefinition {
  corpseItemId: string;
  quantity: number;
}

export interface Corpse extends Position {
  id: string;
  monsterId: string;
  monsterName: string;
  items: CorpseItem[];
  createdAt: string;
  decayAt: string;
  isEmpty: boolean;
}

export interface GroundItem extends Position, ItemDefinition {
  id: string;
  quantity: number;
  createdAt: string;
}

export interface WorldJoinRequest {
  characterId: string;
}

export interface WorldJoinedEvent {
  player: WorldPlayer;
}

export interface WorldPlayersEvent {
  players: WorldPlayer[];
}

export interface WorldMonstersEvent {
  monsters: WorldMonster[];
}

export interface WorldCorpsesEvent {
  corpses: Corpse[];
}

export interface WorldGroundItemsEvent {
  groundItems: GroundItem[];
}

export interface PlayerMoveRequest {
  direction: MoveDirection;
}

export interface PlayerTurnRequest {
  direction: CardinalDirection;
}

export interface AttackMonsterRequest {
  monsterId: string;
}

export interface CorpseOpenRequest {
  corpseId: string;
}

export interface CorpseMoveRequest {
  corpseId: string;
  position: Position;
}

export interface CorpseTakeItemRequest {
  corpseId: string;
  corpseItemId: string;
  quantity: number;
  target?: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>;
}

export interface CorpseAddItemRequest {
  corpseId: string;
  itemId: string;
}

export interface CorpseDropItemRequest {
  corpseId: string;
  corpseItemId: string;
  quantity: number;
  position: Position;
}

export type InventoryMoveTarget =
  | {
      locationType: "root";
      slotIndex?: number;
    }
  | {
      locationType: "container";
      containerItemId: string;
      slotIndex?: number;
    }
  | {
      locationType: "equipment";
      equipmentSlot: EquipmentSlot;
    };

export interface InventoryMoveItemRequest {
  itemId: string;
  target: InventoryMoveTarget;
}

export interface InventoryEquipItemRequest {
  itemId: string;
  equipmentSlot?: EquipmentSlot;
}

export interface InventoryUseItemRequest {
  itemId: string;
}

export interface InventoryUnequipItemRequest {
  equipmentSlot: EquipmentSlot;
  target?: Extract<InventoryMoveTarget, { locationType: "root" | "container" }>;
}

export interface ContainerOpenRequest {
  containerItemId: string;
}

export interface ContainerCloseRequest {
  containerItemId: string;
}

export interface InventoryDropItemRequest {
  itemId: string;
  position: Position;
}

export interface GroundItemTakeRequest {
  groundItemId: string;
  target?: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>;
}

export interface GroundItemMoveRequest {
  groundItemId: string;
  position: Position;
}

export interface StopCombatRequest {
  monsterId?: string;
}

export interface SetCombatStanceRequest {
  stance: CombatStance;
}

export interface SetChaseModeRequest {
  mode: ChaseMode;
}

export interface SetPvpModeRequest {
  enabled: boolean;
}

export interface PlayerMovedEvent {
  player: WorldPlayer;
}

export interface PlayerJoinedEvent {
  player: WorldPlayer;
}

export interface PlayerLeftEvent {
  characterId: string;
}

export interface MonsterSpawnedEvent {
  monster: WorldMonster;
}

export interface MonsterDamagedEvent {
  monsterId: string;
  health: number;
  maxHealth: number;
  damage: number;
}

export interface MonsterDiedEvent {
  monsterId: string;
  monster: WorldMonster;
  experienceReward: number;
}

export interface MonsterMovedEvent {
  monster: WorldMonster;
}

export interface MonsterRespawningEvent {
  monsterId: string;
  x: number;
  y: number;
  z: number;
  respawnDueAt: number;
}

export interface MonsterRespawnedEvent {
  monster: WorldMonster;
}

export interface CorpseCreatedEvent {
  corpse: Corpse;
}

export interface CorpseRemovedEvent {
  corpseId: string;
}

export interface CorpseOpenedEvent {
  corpse: Corpse;
}

export interface CorpseUpdatedEvent {
  corpse: Corpse;
}

export interface GroundItemCreatedEvent {
  groundItem: GroundItem;
}

export interface GroundItemRemovedEvent {
  groundItemId: string;
}

export interface GroundItemErrorEvent {
  message: string;
  code?: string;
}

export interface CorpseErrorEvent {
  message: string;
  code?: string;
}

export interface InventoryUpdatedEvent {
  items: InventorySlot[];
  message?: string;
}

export interface InventoryErrorEvent {
  message: string;
  code?: string;
}

export interface EquipmentUpdatedEvent {
  slots: EquipmentSlotState[];
  message?: string;
}

export interface EquipmentErrorEvent {
  message: string;
  code?: string;
}

export interface ContainerOpenedEvent extends ContainerState {
  message?: string;
}

export interface ContainerUpdatedEvent extends ContainerState {
  message?: string;
}

export interface ContainerErrorEvent {
  message: string;
  code?: string;
}

export interface CharacterExperienceUpdatedEvent {
  characterId: string;
  experience: number;
  gainedExperience: number;
  level: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
}

export interface CharacterLevelUpEvent {
  characterId: string;
  level: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
}

export interface CharacterStatsUpdatedEvent {
  characterId: string;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
}

export interface CharacterUpdatedEvent {
  character: CharacterSummary;
}

export interface CharacterDamagedEvent {
  characterId: string;
  damage: number;
  health: number;
  maxHealth: number;
}

export interface CombatStartedEvent {
  monsterId: string;
}

export interface CombatStoppedEvent {
  monsterId?: string;
  reason: "manual" | "target_dead" | "target_lost" | "out_of_range" | "disconnected" | "invalid_loadout" | "no_ammo";
}

export interface WorldErrorEvent {
  message: string;
  code?: string;
}

export interface CombatErrorEvent {
  message: string;
  code?: string;
}

export interface WorldClientToServerEvents {
  "world:join": (payload: WorldJoinRequest) => void;
  "player:move": (payload: PlayerMoveRequest) => void;
  "player:turn": (payload: PlayerTurnRequest) => void;
  "combat:attack": (payload: AttackMonsterRequest) => void;
  "combat:stop": (payload?: StopCombatRequest) => void;
  "combat:set-stance": (payload: SetCombatStanceRequest) => void;
  "combat:set-chase-mode": (payload: SetChaseModeRequest) => void;
  "combat:set-pvp-mode": (payload: SetPvpModeRequest) => void;
  "corpse:open": (payload: CorpseOpenRequest) => void;
  "corpse:move": (payload: CorpseMoveRequest) => void;
  "corpse:take-item": (payload: CorpseTakeItemRequest) => void;
  "corpse:add-item": (payload: CorpseAddItemRequest) => void;
  "corpse:drop-item": (payload: CorpseDropItemRequest) => void;
  "inventory:move-item": (payload: InventoryMoveItemRequest) => void;
  "inventory:equip-item": (payload: InventoryEquipItemRequest) => void;
  "inventory:use-item": (payload: InventoryUseItemRequest) => void;
  "inventory:unequip-item": (payload: InventoryUnequipItemRequest) => void;
  "inventory:drop-item": (payload: InventoryDropItemRequest) => void;
  "ground-item:take": (payload: GroundItemTakeRequest) => void;
  "ground-item:move": (payload: GroundItemMoveRequest) => void;
  "container:open": (payload: ContainerOpenRequest) => void;
  "container:close": (payload: ContainerCloseRequest) => void;
}

export interface WorldServerToClientEvents {
  "world:joined": (payload: WorldJoinedEvent) => void;
  "world:players": (payload: WorldPlayersEvent) => void;
  "world:monsters": (payload: WorldMonstersEvent) => void;
  "world:corpses": (payload: WorldCorpsesEvent) => void;
  "world:ground-items": (payload: WorldGroundItemsEvent) => void;
  "player:joined": (payload: PlayerJoinedEvent) => void;
  "player:moved": (payload: PlayerMovedEvent) => void;
  "player:left": (payload: PlayerLeftEvent) => void;
  "monster:spawned": (payload: MonsterSpawnedEvent) => void;
  "monster:damaged": (payload: MonsterDamagedEvent) => void;
  "monster:died": (payload: MonsterDiedEvent) => void;
  "monster:moved": (payload: MonsterMovedEvent) => void;
  "monster:respawning": (payload: MonsterRespawningEvent) => void;
  "monster:respawned": (payload: MonsterRespawnedEvent) => void;
  "corpse:created": (payload: CorpseCreatedEvent) => void;
  "corpse:removed": (payload: CorpseRemovedEvent) => void;
  "corpse:opened": (payload: CorpseOpenedEvent) => void;
  "corpse:updated": (payload: CorpseUpdatedEvent) => void;
  "corpse:error": (payload: CorpseErrorEvent) => void;
  "ground-item:created": (payload: GroundItemCreatedEvent) => void;
  "ground-item:removed": (payload: GroundItemRemovedEvent) => void;
  "ground-item:error": (payload: GroundItemErrorEvent) => void;
  "inventory:updated": (payload: InventoryUpdatedEvent) => void;
  "inventory:error": (payload: InventoryErrorEvent) => void;
  "equipment:updated": (payload: EquipmentUpdatedEvent) => void;
  "equipment:error": (payload: EquipmentErrorEvent) => void;
  "container:opened": (payload: ContainerOpenedEvent) => void;
  "container:updated": (payload: ContainerUpdatedEvent) => void;
  "container:error": (payload: ContainerErrorEvent) => void;
  "character:experience-updated": (payload: CharacterExperienceUpdatedEvent) => void;
  "character:level-up": (payload: CharacterLevelUpEvent) => void;
  "character:stats-updated": (payload: CharacterStatsUpdatedEvent) => void;
  "character:updated": (payload: CharacterUpdatedEvent) => void;
  "character:damaged": (payload: CharacterDamagedEvent) => void;
  "combat:started": (payload: CombatStartedEvent) => void;
  "combat:stopped": (payload: CombatStoppedEvent) => void;
  "combat:error": (payload: CombatErrorEvent) => void;
  "world:error": (payload: WorldErrorEvent) => void;
}

export const worldEventNames = {
  worldJoin: "world:join",
  worldJoined: "world:joined",
  worldPlayers: "world:players",
  worldMonsters: "world:monsters",
  worldCorpses: "world:corpses",
  worldGroundItems: "world:ground-items",
  worldError: "world:error",
  playerMove: "player:move",
  playerTurn: "player:turn",
  playerMoved: "player:moved",
  playerJoined: "player:joined",
  playerLeft: "player:left",
  combatAttack: "combat:attack",
  combatStop: "combat:stop",
  combatSetStance: "combat:set-stance",
  combatSetChaseMode: "combat:set-chase-mode",
  combatSetPvpMode: "combat:set-pvp-mode",
  monsterSpawned: "monster:spawned",
  monsterDamaged: "monster:damaged",
  monsterDied: "monster:died",
  monsterMoved: "monster:moved",
  monsterRespawning: "monster:respawning",
  monsterRespawned: "monster:respawned",
  corpseOpen: "corpse:open",
  corpseMove: "corpse:move",
  corpseTakeItem: "corpse:take-item",
  corpseAddItem: "corpse:add-item",
  corpseDropItem: "corpse:drop-item",
  corpseCreated: "corpse:created",
  corpseRemoved: "corpse:removed",
  corpseOpened: "corpse:opened",
  corpseUpdated: "corpse:updated",
  corpseError: "corpse:error",
  inventoryUpdated: "inventory:updated",
  inventoryError: "inventory:error",
  inventoryMoveItem: "inventory:move-item",
  inventoryEquipItem: "inventory:equip-item",
  inventoryUseItem: "inventory:use-item",
  inventoryUnequipItem: "inventory:unequip-item",
  inventoryDropItem: "inventory:drop-item",
  groundItemTake: "ground-item:take",
  groundItemMove: "ground-item:move",
  groundItemCreated: "ground-item:created",
  groundItemRemoved: "ground-item:removed",
  groundItemError: "ground-item:error",
  equipmentUpdated: "equipment:updated",
  equipmentError: "equipment:error",
  containerOpen: "container:open",
  containerClose: "container:close",
  containerOpened: "container:opened",
  containerUpdated: "container:updated",
  containerError: "container:error",
  characterExperienceUpdated: "character:experience-updated",
  characterLevelUp: "character:level-up",
  characterStatsUpdated: "character:stats-updated",
  characterUpdated: "character:updated",
  characterDamaged: "character:damaged",
  combatStarted: "combat:started",
  combatStopped: "combat:stopped",
  combatError: "combat:error"
} as const;

const localMapWidth = 60;
const localMapHeight = 50;
const localTileSize = 32;

function createFilledTiles(width: number, height: number, tileType: LocalTileType): LocalTileType[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => tileType));
}

function paintRect(
  tiles: LocalTileType[][],
  startX: number,
  startY: number,
  width: number,
  height: number,
  tileType: LocalTileType
): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      if (tiles[y]?.[x] !== undefined) {
        tiles[y][x] = tileType;
      }
    }
  }
}

function paintCells(tiles: LocalTileType[][], points: Array<{ x: number; y: number }>, tileType: LocalTileType): void {
  for (const point of points) {
    if (tiles[point.y]?.[point.x] !== undefined) {
      tiles[point.y][point.x] = tileType;
    }
  }
}

export function isMoveDirection(value: string): value is MoveDirection {
  return moveDirections.includes(value as MoveDirection);
}

export function isCardinalDirection(value: string): value is CardinalDirection {
  return cardinalDirections.includes(value as CardinalDirection);
}

export function isWithinMapBounds(map: LocalMapData, x: number, y: number): boolean {
  return x >= 0 && x < map.width && y >= 0 && y < map.height;
}

export function createLocalMap(): LocalMapData {
  const tiles = createFilledTiles(localMapWidth, localMapHeight, "grass");

  paintRect(tiles, 0, 9, 30, 2, "dirt");
  paintRect(tiles, 5, 4, 2, 13, "dirt");
  paintRect(tiles, 4, 8, 4, 4, "dirt");
  paintRect(tiles, 10, 6, 9, 7, "stone");

  paintRect(tiles, 9, 5, 11, 1, "wall");
  paintRect(tiles, 9, 13, 11, 1, "wall");
  paintRect(tiles, 9, 5, 1, 9, "wall");
  paintRect(tiles, 19, 5, 1, 9, "wall");

  paintCells(
    tiles,
    [
      { x: 9, y: 10 },
      { x: 14, y: 13 },
      { x: 19, y: 8 }
    ],
    "dirt"
  );

  paintRect(tiles, 22, 2, 5, 4, "water");
  paintRect(tiles, 23, 6, 3, 2, "water");
  paintCells(
    tiles,
    [
      { x: 21, y: 3 },
      { x: 27, y: 3 },
      { x: 27, y: 4 },
      { x: 26, y: 6 },
      { x: 22, y: 7 }
    ],
    "water"
  );

  paintRect(tiles, 1, 15, 4, 3, "water");
  paintCells(
    tiles,
    [
      { x: 0, y: 16 },
      { x: 4, y: 17 },
      { x: 5, y: 16 }
    ],
    "water"
  );

  paintRect(tiles, 21, 14, 6, 3, "stone");
  paintCells(
    tiles,
    [
      { x: 20, y: 15 },
      { x: 27, y: 15 },
      { x: 24, y: 17 },
      { x: 25, y: 17 }
    ],
    "stone"
  );

  paintCells(
    tiles,
    [
      { x: 12, y: 4 },
      { x: 13, y: 4 },
      { x: 16, y: 4 },
      { x: 17, y: 4 },
      { x: 22, y: 13 },
      { x: 23, y: 13 },
      { x: 2, y: 14 },
      { x: 3, y: 14 }
    ],
    "dirt"
  );

  // Extend the original crossroads into a world with exactly five times its tile area.
  paintRect(tiles, 29, 9, 31, 2, "dirt");
  paintRect(tiles, 5, 20, 2, 30, "dirt");
  paintRect(tiles, 34, 4, 2, 39, "dirt");
  paintRect(tiles, 6, 31, 47, 2, "dirt");
  paintRect(tiles, 42, 17, 12, 8, "stone");
  paintRect(tiles, 45, 19, 6, 4, "grass");
  paintRect(tiles, 12, 37, 13, 8, "water");
  paintRect(tiles, 15, 35, 7, 2, "water");
  paintRect(tiles, 46, 37, 10, 7, "water");
  paintRect(tiles, 49, 35, 5, 2, "water");

  return {
    width: localMapWidth,
    height: localMapHeight,
    tileSize: localTileSize,
    defaultSpawn: { x: 6, y: 10, z: 0 },
    protectionZones: [{ x: 10, y: 6, width: 9, height: 7, z: 0 }],
    tiles
  };
}

export function isProtectionZone(map: LocalMapData, position: Position): boolean {
  return map.protectionZones.some(
    (zone) =>
      zone.z === position.z &&
      position.x >= zone.x &&
      position.x < zone.x + zone.width &&
      position.y >= zone.y &&
      position.y < zone.y + zone.height
  );
}

export function getTileType(map: LocalMapData, x: number, y: number): LocalTileType | null {
  if (!isWithinMapBounds(map, x, y)) {
    return null;
  }

  return map.tiles[y][x];
}

export function isWalkableTile(map: LocalMapData, position: Pick<Position, "x" | "y">): boolean {
  const tileType = getTileType(map, position.x, position.y);

  return tileType === "grass" || tileType === "dirt" || tileType === "stone";
}

export function getTileCenter(map: LocalMapData, position: Pick<Position, "x" | "y">): { x: number; y: number } {
  return {
    x: position.x * map.tileSize + map.tileSize / 2,
    y: position.y * map.tileSize + map.tileSize / 2
  };
}

export function getNextPosition(position: Position, direction: MoveDirection): Position {
  switch (direction) {
    case "up":
      return { ...position, y: position.y - 1 };
    case "down":
      return { ...position, y: position.y + 1 };
    case "left":
      return { ...position, x: position.x - 1 };
    case "right":
      return { ...position, x: position.x + 1 };
    case "up-left":
      return { ...position, x: position.x - 1, y: position.y - 1 };
    case "up-right":
      return { ...position, x: position.x + 1, y: position.y - 1 };
    case "down-left":
      return { ...position, x: position.x - 1, y: position.y + 1 };
    case "down-right":
      return { ...position, x: position.x + 1, y: position.y + 1 };
    default:
      return position;
  }
}

export function getFacingDirectionForMoveDirection(direction: MoveDirection): CardinalDirection {
  switch (direction) {
    case "up":
    case "up-left":
    case "up-right":
      return "north";
    case "down":
    case "down-left":
    case "down-right":
      return "south";
    case "left":
      return "west";
    case "right":
      return "east";
  }
}

function findNearestWalkablePosition(
  map: LocalMapData,
  origin: Pick<Position, "x" | "y">
): Position | null {
  const maxRadius = Math.max(map.width, map.height);

  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
      for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
        if (!isWithinMapBounds(map, x, y)) {
          continue;
        }

        if (!isWalkableTile(map, { x, y })) {
          continue;
        }

        return { x, y, z: 0 };
      }
    }
  }

  return null;
}

export function resolveLocalPlayerSpawn(map: LocalMapData, position: Position): Position {
  const fallbackPosition = findNearestWalkablePosition(map, map.defaultSpawn) ?? map.defaultSpawn;
  const requestedX = Number.isFinite(position.x) ? Math.round(position.x) : fallbackPosition.x;
  const requestedY = Number.isFinite(position.y) ? Math.round(position.y) : fallbackPosition.y;

  if (!isWithinMapBounds(map, requestedX, requestedY)) {
    return fallbackPosition;
  }

  return findNearestWalkablePosition(map, { x: requestedX, y: requestedY }) ?? fallbackPosition;
}
