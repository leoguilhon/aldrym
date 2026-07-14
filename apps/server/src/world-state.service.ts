import type {
  CardinalDirection,
  CharacterClass,
  CombatStance,
  Corpse,
  CorpseItem,
  GroundItem,
  ItemDefinition,
  MonsterType,
  Position,
  WorldMonster,
  WorldPlayer
} from "@aldrym/shared";
import { getItemMaxStack, itemDefinitions } from "@aldrym/shared";
import { Injectable } from "@nestjs/common";

export interface OnlineWorldPlayer {
  attackRange: number;
  socketId: string | null;
  connected: boolean;
  userId: string;
  characterId: string;
  characterClass: CharacterClass;
  name: string;
  level: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  position: Position;
  facing: CardinalDirection;
  combatStance: CombatStance;
  battleModeExpiresAt: number | null;
}

interface MonsterSpawn {
  armor: number;
  id: string;
  maxDamage: number;
  type: MonsterType;
  name: string;
  level: number;
  maxHealth: number;
  experienceReward: number;
  position: Position;
  respawnMs: number;
  retreatAtHealth: number | null;
}

interface WorldMonsterState extends MonsterSpawn {
  health: number;
  alive: boolean;
  spawnPosition: Position;
  spawnedAt: number;
  diedAt: number | null;
  respawnDueAt: number | null;
}

interface LootTableEntry {
  dropChance: number;
  itemKey: string;
  minimumQuantity: number;
  maximumQuantity: number;
}

const lootTables: Record<MonsterType, LootTableEntry[]> = {
  rat: [],
  troll: [
    { itemKey: "gold_coin", minimumQuantity: 1, maximumQuantity: 6, dropChance: 0.65 },
    { itemKey: "meat", minimumQuantity: 1, maximumQuantity: 1, dropChance: 0.152 },
    { itemKey: "dagger", minimumQuantity: 1, maximumQuantity: 1, dropChance: 0.18 }
  ]
};

const CORPSE_DECAY_MS = 120000;
const EMPTY_CORPSE_DECAY_MS = 15000;
const CORPSE_SLOT_CAPACITY = 8;

const initialMonsterSpawns: MonsterSpawn[] = [
  {
    id: "troll-1",
    type: "troll",
    name: "Troll",
    level: 2,
    armor: 6,
    maxDamage: 15,
    maxHealth: 50,
    experienceReward: 20,
    position: { x: 24, y: 12, z: 0 },
    respawnMs: 30000,
    retreatAtHealth: 15
  }
];

@Injectable()
export class WorldStateService {
  private readonly playersByCharacterId = new Map<string, OnlineWorldPlayer>();
  private readonly characterIdBySocketId = new Map<string, string>();
  private readonly corpsesById = new Map<string, Corpse>();
  private readonly groundItemsById = new Map<string, GroundItem>();
  private nextCorpseId = 1;
  private nextCorpseItemId = 1;
  private nextGroundItemId = 1;
  private readonly monstersById = new Map<string, WorldMonsterState>(
    initialMonsterSpawns.map((spawn) => [
      spawn.id,
      {
        ...spawn,
        health: spawn.maxHealth,
        alive: true,
        spawnPosition: { ...spawn.position },
        spawnedAt: Date.now(),
        diedAt: null,
        respawnDueAt: null
      }
    ])
  );

  addPlayer(player: OnlineWorldPlayer): void {
    this.playersByCharacterId.set(player.characterId, player);

    if (player.socketId) {
      this.characterIdBySocketId.set(player.socketId, player.characterId);
    }
  }

  getPlayerBySocketId(socketId: string): OnlineWorldPlayer | null {
    const characterId = this.characterIdBySocketId.get(socketId);
    return characterId ? this.playersByCharacterId.get(characterId) ?? null : null;
  }

  getPlayerByCharacterId(characterId: string): OnlineWorldPlayer | null {
    return this.playersByCharacterId.get(characterId) ?? null;
  }

  listPlayers(): WorldPlayer[] {
    return Array.from(this.playersByCharacterId.values(), (player) => this.toWorldPlayer(player));
  }

  listPlayerStates(): OnlineWorldPlayer[] {
    return Array.from(this.playersByCharacterId.values());
  }

  updatePlayerPosition(socketId: string, position: Position, facing?: CardinalDirection): OnlineWorldPlayer | null {
    const player = this.getPlayerBySocketId(socketId);

    if (!player) {
      return null;
    }

    player.position = position;

    if (facing) {
      player.facing = facing;
    }

    return player;
  }

  updatePlayerFacing(socketId: string, facing: CardinalDirection): OnlineWorldPlayer | null {
    const player = this.getPlayerBySocketId(socketId);

    if (!player) {
      return null;
    }

    player.facing = facing;
    return player;
  }

  updatePlayerStats(
    socketId: string,
    stats: Pick<WorldPlayer, "level" | "health" | "maxHealth" | "mana" | "maxMana"> & { attackRange?: number }
  ): OnlineWorldPlayer | null {
    const player = this.getPlayerBySocketId(socketId);

    if (!player) {
      return null;
    }

    player.level = stats.level;
    player.health = stats.health;
    player.maxHealth = stats.maxHealth;
    player.mana = stats.mana;
    player.maxMana = stats.maxMana;
    player.attackRange = stats.attackRange ?? player.attackRange;
    return player;
  }

  updatePlayerStatsByCharacterId(
    characterId: string,
    stats: Pick<WorldPlayer, "level" | "health" | "maxHealth" | "mana" | "maxMana"> & { attackRange?: number }
  ): OnlineWorldPlayer | null {
    const player = this.getPlayerByCharacterId(characterId);

    if (!player) {
      return null;
    }

    player.level = stats.level;
    player.health = stats.health;
    player.maxHealth = stats.maxHealth;
    player.mana = stats.mana;
    player.maxMana = stats.maxMana;
    player.attackRange = stats.attackRange ?? player.attackRange;
    return player;
  }

  updatePlayerCombatStance(characterId: string, combatStance: CombatStance): OnlineWorldPlayer | null {
    const player = this.getPlayerByCharacterId(characterId);

    if (!player) {
      return null;
    }

    player.combatStance = combatStance;
    return player;
  }

  updatePlayerBattleMode(characterId: string, battleModeExpiresAt: number | null): OnlineWorldPlayer | null {
    const player = this.getPlayerByCharacterId(characterId);

    if (!player) {
      return null;
    }

    player.battleModeExpiresAt = battleModeExpiresAt;
    return player;
  }

  connectPlayer(characterId: string, socketId: string): OnlineWorldPlayer | null {
    const player = this.getPlayerByCharacterId(characterId);

    if (!player) {
      return null;
    }

    if (player.socketId && player.socketId !== socketId) {
      this.characterIdBySocketId.delete(player.socketId);
    }

    player.socketId = socketId;
    player.connected = true;
    this.characterIdBySocketId.set(socketId, characterId);
    return player;
  }

  disconnectPlayer(socketId: string): OnlineWorldPlayer | null {
    const player = this.getPlayerBySocketId(socketId);

    if (!player) {
      return null;
    }

    this.characterIdBySocketId.delete(socketId);

    if (player.socketId === socketId) {
      player.socketId = null;
      player.connected = false;
    }

    return player;
  }

  listMonsters(): WorldMonster[] {
    return Array.from(this.monstersById.values(), (monster) => this.toWorldMonster(monster));
  }

  listCorpses(): Corpse[] {
    return Array.from(this.corpsesById.values(), (corpse) => this.cloneCorpse(corpse));
  }

  listGroundItems(): GroundItem[] {
    return Array.from(this.groundItemsById.values(), (groundItem) => ({ ...groundItem }));
  }

  getCorpse(corpseId: string): Corpse | null {
    const corpse = this.corpsesById.get(corpseId);
    return corpse ? this.cloneCorpse(corpse) : null;
  }

  removeCorpse(corpseId: string): Corpse | null {
    const corpse = this.corpsesById.get(corpseId) ?? null;

    if (corpse) {
      this.corpsesById.delete(corpseId);
    }

    return corpse ? this.cloneCorpse(corpse) : null;
  }

  moveCorpse(corpseId: string, position: Position): Corpse | null {
    const corpse = this.corpsesById.get(corpseId);

    if (!corpse) {
      return null;
    }

    corpse.x = position.x;
    corpse.y = position.y;
    corpse.z = position.z;

    return this.cloneCorpse(corpse);
  }

  createGroundItem(item: ItemDefinition & { quantity: number }, position: Position): GroundItem {
    const groundItem: GroundItem = {
      ...item,
      id: `ground-item-${this.nextGroundItemId}`,
      x: position.x,
      y: position.y,
      z: position.z,
      createdAt: new Date().toISOString()
    };

    this.nextGroundItemId += 1;
    this.groundItemsById.set(groundItem.id, groundItem);

    return { ...groundItem };
  }

  getGroundItem(groundItemId: string): GroundItem | null {
    const groundItem = this.groundItemsById.get(groundItemId);
    return groundItem ? { ...groundItem } : null;
  }

  takeGroundItem(groundItemId: string): GroundItem | null {
    const groundItem = this.groundItemsById.get(groundItemId) ?? null;

    if (!groundItem) {
      return null;
    }

    this.groundItemsById.delete(groundItemId);
    return { ...groundItem };
  }

  restoreGroundItem(groundItem: GroundItem): GroundItem {
    this.groundItemsById.set(groundItem.id, { ...groundItem });
    return { ...groundItem };
  }

  moveGroundItem(groundItemId: string, position: Position): GroundItem | null {
    const groundItem = this.groundItemsById.get(groundItemId);

    if (!groundItem) {
      return null;
    }

    groundItem.x = position.x;
    groundItem.y = position.y;
    groundItem.z = position.z;

    return { ...groundItem };
  }

  getMonster(monsterId: string): WorldMonster | null {
    const monster = this.monstersById.get(monsterId);
    return monster ? this.toWorldMonster(monster) : null;
  }

  damageMonster(monsterId: string, damage: number): WorldMonster | null {
    const monster = this.monstersById.get(monsterId);

    if (!monster || !monster.alive) {
      return null;
    }

    monster.health = Math.max(0, monster.health - damage);

    if (monster.health === 0) {
      monster.alive = false;
      monster.diedAt = Date.now();
      monster.respawnDueAt = monster.diedAt + monster.respawnMs;
    }

    return this.toWorldMonster(monster);
  }

  createCorpseForMonster(monster: WorldMonster): Corpse {
    const lootTable = lootTables[monster.type] ?? [];
    const items: CorpseItem[] = [];

    for (const entry of lootTable) {
      if (items.length >= CORPSE_SLOT_CAPACITY) {
        break;
      }

        if (Math.random() > entry.dropChance) {
          continue;
        }

      const definition = itemDefinitions[entry.itemKey];

      if (!definition) {
        continue;
      }

      items.push({
        ...definition,
        corpseItemId: `corpse-item-${this.nextCorpseItemId}`,
        quantity: this.rollQuantity(entry.minimumQuantity, entry.maximumQuantity)
      });
      this.nextCorpseItemId += 1;
    }

    const now = Date.now();
    const isEmpty = items.length === 0;
    const corpse: Corpse = {
      id: `corpse-${this.nextCorpseId}`,
      monsterId: monster.id,
      monsterName: monster.name,
      x: monster.x,
      y: monster.y,
      z: monster.z,
      items,
      createdAt: new Date(now).toISOString(),
      decayAt: new Date(now + (isEmpty ? EMPTY_CORPSE_DECAY_MS : CORPSE_DECAY_MS)).toISOString(),
      isEmpty
    };

    this.nextCorpseId += 1;
    this.corpsesById.set(corpse.id, corpse);

    return this.cloneCorpse(corpse);
  }

  takeCorpseItem(corpseId: string, corpseItemId: string, quantity: number): { corpse: Corpse; item: CorpseItem } | null {
    const corpse = this.corpsesById.get(corpseId);

    if (!corpse) {
      return null;
    }

    const itemIndex = corpse.items.findIndex((item) => item.corpseItemId === corpseItemId);

    if (itemIndex === -1) {
      return null;
    }

    const item = corpse.items[itemIndex];
    const takenQuantity = Math.min(quantity, item.quantity);
    const takenItem: CorpseItem = {
      ...item,
      quantity: takenQuantity
    };

    if (takenQuantity >= item.quantity) {
      corpse.items.splice(itemIndex, 1);
    } else {
      corpse.items[itemIndex] = {
        ...item,
        quantity: item.quantity - takenQuantity
      };
    }

    if (corpse.items.length === 0 && !corpse.isEmpty) {
      corpse.isEmpty = true;
      corpse.decayAt = new Date(Date.now() + EMPTY_CORPSE_DECAY_MS).toISOString();
    }

    return {
      corpse: this.cloneCorpse(corpse),
      item: takenItem
    };
  }

  addCorpseItem(corpseId: string, item: ItemDefinition & { quantity: number }): Corpse | null {
    const corpse = this.corpsesById.get(corpseId);

    if (!corpse) {
      return null;
    }

    const nextItems = corpse.items.map((corpseItem) => ({ ...corpseItem }));
    const maxStack = getItemMaxStack(item);
    let remainingQuantity = item.quantity;

    if (item.stackable) {
      for (const existingItem of nextItems.filter((corpseItem) => corpseItem.itemKey === item.itemKey)) {
        const availableSpace = maxStack === null ? Number.MAX_SAFE_INTEGER : Math.max(0, maxStack - existingItem.quantity);

        if (availableSpace <= 0) {
          continue;
        }

        const quantityToMerge = Math.min(remainingQuantity, availableSpace);
        existingItem.quantity += quantityToMerge;
        remainingQuantity -= quantityToMerge;

        if (remainingQuantity <= 0 || maxStack === null) {
          break;
        }
      }
    }

    while (remainingQuantity > 0) {
      if (nextItems.length >= CORPSE_SLOT_CAPACITY) {
        return null;
      }

      const stackQuantity = item.stackable && maxStack !== null ? Math.min(maxStack, remainingQuantity) : remainingQuantity;

      nextItems.push({
        ...item,
        corpseItemId: `corpse-item-${this.nextCorpseItemId}`,
        quantity: stackQuantity
      });
      this.nextCorpseItemId += 1;
      remainingQuantity -= stackQuantity;
    }

    corpse.items = nextItems;
    corpse.isEmpty = false;
    corpse.decayAt = new Date(Date.now() + CORPSE_DECAY_MS).toISOString();

    return this.cloneCorpse(corpse);
  }

  canAddCorpseItem(corpseId: string, item: ItemDefinition): boolean | null {
    const corpse = this.corpsesById.get(corpseId);

    if (!corpse) {
      return null;
    }

    if (!item.stackable) {
      return corpse.items.length < CORPSE_SLOT_CAPACITY;
    }

    const maxStack = getItemMaxStack(item);
    const existingStacks = corpse.items.filter((corpseItem) => corpseItem.itemKey === item.itemKey);

    if (maxStack === null) {
      return existingStacks.length > 0 || corpse.items.length < CORPSE_SLOT_CAPACITY;
    }

    return existingStacks.some((corpseItem) => corpseItem.quantity < maxStack) || corpse.items.length < CORPSE_SLOT_CAPACITY;
  }

  restoreCorpseItem(corpseId: string, item: CorpseItem): Corpse | null {
    const corpse = this.corpsesById.get(corpseId);

    if (!corpse) {
      return null;
    }

    const existingItem = corpse.items.find((corpseItem) => corpseItem.corpseItemId === item.corpseItemId);

    if (existingItem) {
      existingItem.quantity += item.quantity;
    } else if (corpse.items.length < CORPSE_SLOT_CAPACITY) {
      corpse.items.push({ ...item });
    } else {
      return null;
    }

    corpse.isEmpty = false;
    corpse.decayAt = new Date(Date.now() + CORPSE_DECAY_MS).toISOString();

    return this.cloneCorpse(corpse);
  }

  isAliveMonsterAt(position: Position, ignoredMonsterId?: string): boolean {
    for (const monster of this.monstersById.values()) {
      if (!monster.alive || monster.id === ignoredMonsterId) {
        continue;
      }

      if (this.isSamePosition(monster.position, position)) {
        return true;
      }
    }

    return false;
  }

  isPlayerAt(position: Position, ignoredSocketId?: string): boolean {
    for (const player of this.playersByCharacterId.values()) {
      if (ignoredSocketId && player.socketId === ignoredSocketId) {
        continue;
      }

      if (this.isSamePosition(player.position, position)) {
        return true;
      }
    }

    return false;
  }

  moveMonster(monsterId: string, position: Position): WorldMonster | null {
    const monster = this.monstersById.get(monsterId);

    if (!monster || !monster.alive) {
      return null;
    }

    monster.position = position;
    return this.toWorldMonster(monster);
  }

  respawnMonster(monsterId: string): WorldMonster | null {
    const monster = this.monstersById.get(monsterId);

    if (!monster) {
      return null;
    }

    monster.health = monster.maxHealth;
    monster.position = { ...monster.spawnPosition };
    monster.alive = true;
    monster.spawnedAt = Date.now();
    monster.diedAt = null;
    monster.respawnDueAt = null;

    return this.toWorldMonster(monster);
  }

  removePlayer(socketId: string): OnlineWorldPlayer | null {
    const player = this.getPlayerBySocketId(socketId);

    if (player) {
      this.characterIdBySocketId.delete(socketId);
      this.playersByCharacterId.delete(player.characterId);
    }

    return player;
  }

  removePlayerByCharacterId(characterId: string): OnlineWorldPlayer | null {
    const player = this.playersByCharacterId.get(characterId) ?? null;

    if (player) {
      if (player.socketId) {
        this.characterIdBySocketId.delete(player.socketId);
      }

      this.playersByCharacterId.delete(characterId);
    }

    return player;
  }

  toWorldPlayer(player: OnlineWorldPlayer): WorldPlayer {
    return {
      characterId: player.characterId,
      characterClass: player.characterClass,
      name: player.name,
      level: player.level,
      health: player.health,
      maxHealth: player.maxHealth,
      mana: player.mana,
      maxMana: player.maxMana,
      facing: player.facing,
      isInBattleMode: player.battleModeExpiresAt !== null && player.battleModeExpiresAt > Date.now(),
      x: player.position.x,
      y: player.position.y,
      z: player.position.z
    };
  }

  private toWorldMonster(monster: WorldMonsterState): WorldMonster {
    return {
      armor: monster.armor,
      id: monster.id,
      maxDamage: monster.maxDamage,
      type: monster.type,
      name: monster.name,
      level: monster.level,
      health: monster.health,
      maxHealth: monster.maxHealth,
      experienceReward: monster.experienceReward,
      x: monster.position.x,
      y: monster.position.y,
      z: monster.position.z,
      alive: monster.alive,
      respawnMs: monster.respawnMs,
      respawnDueAt: monster.respawnDueAt,
      retreatAtHealth: monster.retreatAtHealth,
      spawnX: monster.spawnPosition.x,
      spawnY: monster.spawnPosition.y,
      spawnZ: monster.spawnPosition.z
    };
  }

  private isSamePosition(left: Position, right: Position): boolean {
    return left.x === right.x && left.y === right.y && left.z === right.z;
  }

  private rollQuantity(minimum: number, maximum: number): number {
    return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
  }

  private cloneCorpse(corpse: Corpse): Corpse {
    return {
      ...corpse,
      items: corpse.items.map((item) => ({ ...item }))
    };
  }
}
