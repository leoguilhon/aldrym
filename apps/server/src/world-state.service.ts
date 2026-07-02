import type { Position, WorldPlayer } from "@aldrym/shared";
import { Injectable } from "@nestjs/common";

interface OnlineWorldPlayer {
  socketId: string;
  userId: string;
  characterId: string;
  name: string;
  level: number;
  position: Position;
}

@Injectable()
export class WorldStateService {
  private readonly playersBySocketId = new Map<string, OnlineWorldPlayer>();

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
}
