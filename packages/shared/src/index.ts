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
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export type CharacterGender = "male" | "female";

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface CreateCharacterRequest {
  name: string;
  gender: CharacterGender;
}

export interface DeleteCharacterRequest {
  password: string;
}

export interface CharacterSummary extends Position {
  id: string;
  name: string;
  gender: CharacterGender;
  level: number;
  experience: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  createdAt: string;
  updatedAt: string;
}

export const moveDirections = ["up", "down", "left", "right", "up-left", "up-right", "down-left", "down-right"] as const;

export type MoveDirection = (typeof moveDirections)[number];

const baseMovementCooldownMs = 700;
const diagonalMovementCooldownMultiplier = 1.4;
const movementCooldownReductionPerLevelMs = 20;
const minimumMovementCooldownMs = 350;
const minimumMovementTweenDurationMs = 160;
const maximumMovementTweenDurationMs = 280;

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

export function getMovementTweenDurationMs(level: number): number {
  const durationMs = Math.round(getMovementCooldownMs(level) * 0.45);

  return Math.min(maximumMovementTweenDurationMs, Math.max(minimumMovementTweenDurationMs, durationMs));
}

export type LocalTileType = "grass" | "dirt" | "stone" | "water" | "wall";

export interface LocalMapData {
  width: number;
  height: number;
  tileSize: number;
  defaultSpawn: Position;
  tiles: LocalTileType[][];
}

export interface WorldPlayer extends Position {
  characterId: string;
  name: string;
  level: number;
}

export type MonsterType = "rat" | "wolf" | "troll" | "goblin" | "rotworm" | "orc";

export interface WorldMonster extends Position {
  id: string;
  type: MonsterType;
  name: string;
  level: number;
  health: number;
  maxHealth: number;
  experienceReward: number;
  alive: boolean;
  respawnMs: number;
  respawnDueAt: number | null;
  spawnX: number;
  spawnY: number;
  spawnZ: number;
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

export interface PlayerMoveRequest {
  direction: MoveDirection;
}

export interface AttackMonsterRequest {
  monsterId: string;
}

export interface StopCombatRequest {
  monsterId?: string;
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

export interface CombatStartedEvent {
  monsterId: string;
}

export interface CombatStoppedEvent {
  monsterId?: string;
  reason: "manual" | "target_dead" | "target_lost" | "out_of_range" | "disconnected";
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
  "combat:attack": (payload: AttackMonsterRequest) => void;
  "combat:stop": (payload?: StopCombatRequest) => void;
}

export interface WorldServerToClientEvents {
  "world:joined": (payload: WorldJoinedEvent) => void;
  "world:players": (payload: WorldPlayersEvent) => void;
  "world:monsters": (payload: WorldMonstersEvent) => void;
  "player:joined": (payload: PlayerJoinedEvent) => void;
  "player:moved": (payload: PlayerMovedEvent) => void;
  "player:left": (payload: PlayerLeftEvent) => void;
  "monster:spawned": (payload: MonsterSpawnedEvent) => void;
  "monster:damaged": (payload: MonsterDamagedEvent) => void;
  "monster:died": (payload: MonsterDiedEvent) => void;
  "monster:moved": (payload: MonsterMovedEvent) => void;
  "monster:respawning": (payload: MonsterRespawningEvent) => void;
  "monster:respawned": (payload: MonsterRespawnedEvent) => void;
  "character:experience-updated": (payload: CharacterExperienceUpdatedEvent) => void;
  "character:level-up": (payload: CharacterLevelUpEvent) => void;
  "character:stats-updated": (payload: CharacterStatsUpdatedEvent) => void;
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
  worldError: "world:error",
  playerMove: "player:move",
  playerMoved: "player:moved",
  playerJoined: "player:joined",
  playerLeft: "player:left",
  combatAttack: "combat:attack",
  combatStop: "combat:stop",
  monsterSpawned: "monster:spawned",
  monsterDamaged: "monster:damaged",
  monsterDied: "monster:died",
  monsterMoved: "monster:moved",
  monsterRespawning: "monster:respawning",
  monsterRespawned: "monster:respawned",
  characterExperienceUpdated: "character:experience-updated",
  characterLevelUp: "character:level-up",
  characterStatsUpdated: "character:stats-updated",
  combatStarted: "combat:started",
  combatStopped: "combat:stopped",
  combatError: "combat:error"
} as const;

const localMapWidth = 30;
const localMapHeight = 20;
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

  return {
    width: localMapWidth,
    height: localMapHeight,
    tileSize: localTileSize,
    defaultSpawn: { x: 6, y: 10, z: 0 },
    tiles
  };
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
