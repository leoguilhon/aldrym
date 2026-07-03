import type { Corpse, CorpseItem, ItemDefinition, MonsterType, Position, WorldMonster, WorldPlayer } from "@aldrym/shared";
import { Injectable } from "@nestjs/common";

interface OnlineWorldPlayer {
  socketId: string;
  userId: string;
  characterId: string;
  name: string;
  level: number;
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
    stackable: true
  },
  rat_tail: {
    itemKey: "rat_tail",
    name: "Rat Tail",
    stackable: true
  },
  beetle_shell: {
    itemKey: "beetle_shell",
    name: "Beetle Shell",
    stackable: true
  },
  moss_fang: {
    itemKey: "moss_fang",
    name: "Moss Fang",
    stackable: true
  },
  chipped_dagger: {
    itemKey: "chipped_dagger",
    name: "Chipped Dagger",
    stackable: false
  },
  small_health_flask: {
    itemKey: "small_health_flask",
    name: "Small Health Flask",
    stackable: true
  }
};

const lootChanceThresholds: Record<LootChance, number> = {
  common: 0.78,
  uncommon: 0.32,
  rare: 0.1
};

const lootTables: Record<MonsterType, LootTableEntry[]> = {
  rat: [
    { itemKey: "gold_coin", minimumQuantity: 1, maximumQuantity: 5, chance: "common" },
    { itemKey: "rat_tail", minimumQuantity: 1, maximumQuantity: 1, chance: "uncommon" }
  ],
  wolf: [
    { itemKey: "gold_coin", minimumQuantity: 2, maximumQuantity: 8, chance: "common" },
    { itemKey: "chipped_dagger", minimumQuantity: 1, maximumQuantity: 1, chance: "rare" }
  ],
  troll: [
    { itemKey: "gold_coin", minimumQuantity: 2, maximumQuantity: 8, chance: "common" },
    { itemKey: "beetle_shell", minimumQuantity: 1, maximumQuantity: 1, chance: "uncommon" }
  ],
  goblin: [
    { itemKey: "gold_coin", minimumQuantity: 3, maximumQuantity: 10, chance: "common" },
    { itemKey: "chipped_dagger", minimumQuantity: 1, maximumQuantity: 1, chance: "uncommon" }
  ],
  rotworm: [
    { itemKey: "gold_coin", minimumQuantity: 3, maximumQuantity: 10, chance: "common" },
    { itemKey: "moss_fang", minimumQuantity: 1, maximumQuantity: 1, chance: "uncommon" }
  ],
  orc: [
    { itemKey: "gold_coin", minimumQuantity: 4, maximumQuantity: 12, chance: "common" },
    { itemKey: "small_health_flask", minimumQuantity: 1, maximumQuantity: 1, chance: "rare" },
    { itemKey: "chipped_dagger", minimumQuantity: 1, maximumQuantity: 1, chance: "rare" }
  ]
};

const CORPSE_DECAY_MS = 120000;
const EMPTY_CORPSE_DECAY_MS = 15000;

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
    id: "wolf-1",
    type: "wolf",
    name: "Wolf",
    level: 2,
    maxHealth: 34,
    experienceReward: 28,
    position: { x: 4, y: 10, z: 0 },
    respawnMs: 18000
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
  },
  {
    id: "goblin-1",
    type: "goblin",
    name: "Goblin",
    level: 3,
    maxHealth: 48,
    experienceReward: 44,
    position: { x: 23, y: 15, z: 0 },
    respawnMs: 24000
  },
  {
    id: "rotworm-1",
    type: "rotworm",
    name: "Rotworm",
    level: 4,
    maxHealth: 68,
    experienceReward: 72,
    position: { x: 24, y: 16, z: 0 },
    respawnMs: 30000
  },
  {
    id: "orc-1",
    type: "orc",
    name: "Orc",
    level: 5,
    maxHealth: 82,
    experienceReward: 95,
    position: { x: 12, y: 9, z: 0 },
    respawnMs: 34000
  }
];

@Injectable()
export class WorldStateService {
  private readonly playersBySocketId = new Map<string, OnlineWorldPlayer>();
  private readonly corpsesById = new Map<string, Corpse>();
  private nextCorpseId = 1;
  private nextCorpseItemId = 1;
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

  updatePlayerLevel(socketId: string, level: number): OnlineWorldPlayer | null {
    const player = this.playersBySocketId.get(socketId);

    if (!player) {
      return null;
    }

    player.level = level;
    return player;
  }

  listMonsters(): WorldMonster[] {
    return Array.from(this.monstersById.values(), (monster) => this.toWorldMonster(monster));
  }

  listCorpses(): Corpse[] {
    return Array.from(this.corpsesById.values(), (corpse) => this.cloneCorpse(corpse));
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

  restoreCorpseItem(corpseId: string, item: CorpseItem): Corpse | null {
    const corpse = this.corpsesById.get(corpseId);

    if (!corpse) {
      return null;
    }

    const existingItem = corpse.items.find((corpseItem) => corpseItem.corpseItemId === item.corpseItemId);

    if (existingItem) {
      existingItem.quantity += item.quantity;
    } else {
      corpse.items.push({ ...item });
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
      name: player.name,
      level: player.level,
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
