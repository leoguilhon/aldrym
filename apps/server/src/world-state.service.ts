import type {
  CharacterClass,
  Corpse,
  CorpseItem,
  GroundItem,
  ItemDefinition,
  MonsterType,
  Position,
  WorldMonster,
  WorldPlayer
} from "@aldrym/shared";
import { Injectable } from "@nestjs/common";

interface OnlineWorldPlayer {
  socketId: string;
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
}

interface MonsterSpawn {
  id: string;
  type: MonsterType;
  name: string;
  level: number;
  maxHealth: number;
  experienceReward: number;
  position: Position;
  respawnMs: number;
}

interface WorldMonsterState extends MonsterSpawn {
  health: number;
  alive: boolean;
  spawnPosition: Position;
  spawnedAt: number;
  diedAt: number | null;
  respawnDueAt: number | null;
}

type LootChance = "common" | "uncommon" | "rare";

interface LootTableEntry {
  itemKey: string;
  minimumQuantity: number;
  maximumQuantity: number;
  chance: LootChance;
}

export const itemDefinitions: Record<string, ItemDefinition> = {
  gold_coin: {
    itemKey: "gold_coin",
    name: "Gold Coin",
    stackable: true,
    itemType: "currency",
    isContainer: false,
    containerSize: null
  },
  chipped_dagger: {
    itemKey: "chipped_dagger",
    name: "Chipped Dagger",
    stackable: false,
    itemType: "weapon",
    compatibleEquipmentSlots: ["weapon"],
    isContainer: false,
    containerSize: null
  },
  brown_backpack: {
    itemKey: "brown_backpack",
    name: "Brown Backpack",
    stackable: false,
    itemType: "container",
    compatibleEquipmentSlots: ["backpack"],
    isContainer: true,
    containerSize: 20
  }
};

const lootChanceThresholds: Record<LootChance, number> = {
  common: 0.78,
  uncommon: 0.32,
  rare: 0.1
};

const lootTables: Record<MonsterType, LootTableEntry[]> = {
  rat: [
    { itemKey: "gold_coin", minimumQuantity: 1, maximumQuantity: 5, chance: "common" }
  ],
  troll: [
    { itemKey: "gold_coin", minimumQuantity: 2, maximumQuantity: 8, chance: "common" },
    { itemKey: "chipped_dagger", minimumQuantity: 1, maximumQuantity: 1, chance: "uncommon" }
  ]
};

const CORPSE_DECAY_MS = 120000;
const EMPTY_CORPSE_DECAY_MS = 15000;
const CORPSE_SLOT_CAPACITY = 8;

const initialMonsterSpawns: MonsterSpawn[] = [
  {
    id: "rat-1",
    type: "rat",
    name: "Rat",
    level: 1,
    maxHealth: 24,
    experienceReward: 18,
    position: { x: 7, y: 10, z: 0 },
    respawnMs: 15000
  },
  {
    id: "troll-1",
    type: "troll",
    name: "Troll",
    level: 2,
    maxHealth: 42,
    experienceReward: 36,
    position: { x: 16, y: 11, z: 0 },
    respawnMs: 22000
  }
];

@Injectable()
export class WorldStateService {
  private readonly playersBySocketId = new Map<string, OnlineWorldPlayer>();
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
    this.playersBySocketId.set(player.socketId, player);
  }

  getPlayerBySocketId(socketId: string): OnlineWorldPlayer | null {
    return this.playersBySocketId.get(socketId) ?? null;
  }

  getPlayerByCharacterId(characterId: string): OnlineWorldPlayer | null {
    for (const player of this.playersBySocketId.values()) {
      if (player.characterId === characterId) {
        return player;
      }
    }

    return null;
  }

  listPlayers(): WorldPlayer[] {
    return Array.from(this.playersBySocketId.values(), (player) => this.toWorldPlayer(player));
  }

  updatePlayerPosition(socketId: string, position: Position): OnlineWorldPlayer | null {
    const player = this.playersBySocketId.get(socketId);

    if (!player) {
      return null;
    }

    player.position = position;
    return player;
  }

  updatePlayerStats(
    socketId: string,
    stats: Pick<WorldPlayer, "level" | "health" | "maxHealth" | "mana" | "maxMana">
  ): OnlineWorldPlayer | null {
    const player = this.playersBySocketId.get(socketId);

    if (!player) {
      return null;
    }

    player.level = stats.level;
    player.health = stats.health;
    player.maxHealth = stats.maxHealth;
    player.mana = stats.mana;
    player.maxMana = stats.maxMana;
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

      if (Math.random() > lootChanceThresholds[entry.chance]) {
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

    const existingItem = item.stackable ? corpse.items.find((corpseItem) => corpseItem.itemKey === item.itemKey) : null;

    if (existingItem) {
      existingItem.quantity += item.quantity;
      corpse.isEmpty = false;
      corpse.decayAt = new Date(Date.now() + CORPSE_DECAY_MS).toISOString();
      return this.cloneCorpse(corpse);
    }

    if (corpse.items.length >= CORPSE_SLOT_CAPACITY) {
      return null;
    }

    corpse.items.push({
      ...item,
      corpseItemId: `corpse-item-${this.nextCorpseItemId}`
    });
    this.nextCorpseItemId += 1;
    corpse.isEmpty = false;
    corpse.decayAt = new Date(Date.now() + CORPSE_DECAY_MS).toISOString();

    return this.cloneCorpse(corpse);
  }

  canAddCorpseItem(corpseId: string, item: ItemDefinition): boolean | null {
    const corpse = this.corpsesById.get(corpseId);

    if (!corpse) {
      return null;
    }

    if (item.stackable && corpse.items.some((corpseItem) => corpseItem.itemKey === item.itemKey)) {
      return true;
    }

    return corpse.items.length < CORPSE_SLOT_CAPACITY;
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
    for (const player of this.playersBySocketId.values()) {
      if (player.socketId === ignoredSocketId) {
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
    const player = this.playersBySocketId.get(socketId) ?? null;

    if (player) {
      this.playersBySocketId.delete(socketId);
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
      x: player.position.x,
      y: player.position.y,
      z: player.position.z
    };
  }

  private toWorldMonster(monster: WorldMonsterState): WorldMonster {
    return {
      id: monster.id,
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
