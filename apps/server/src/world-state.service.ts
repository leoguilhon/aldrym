import type { MonsterType, Position, WorldMonster, WorldPlayer } from "@aldrym/shared";
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
}
