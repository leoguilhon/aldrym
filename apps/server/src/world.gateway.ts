import type {
  PlayerLeftEvent,
  PlayerMoveRequest,
  PlayerMovedEvent,
  WorldClientToServerEvents,
  WorldErrorEvent,
  WorldJoinRequest,
  WorldJoinedEvent,
  WorldPlayersEvent,
  WorldServerToClientEvents
} from "@aldrym/shared";
import {
  createLocalMap,
  getNextPosition,
  isMoveDirection,
  isWalkableTile,
  resolveLocalPlayerSpawn,
  worldEventNames
} from "@aldrym/shared";
import { Inject, Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

import type { AuthenticatedUser } from "./auth/authenticated-user.interface";
import { AuthService } from "./auth/auth.service";
import { CharactersService } from "./characters/characters.service";
import { WorldStateService } from "./world-state.service";

interface WorldSocketData {
  user?: AuthenticatedUser;
}

type WorldSocket = Socket<
  WorldClientToServerEvents,
  WorldServerToClientEvents,
  Record<string, never>,
  WorldSocketData
>;

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true
  }
})
export class WorldGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server<
    WorldClientToServerEvents,
    WorldServerToClientEvents,
    Record<string, never>,
    WorldSocketData
  >;

  private readonly logger = new Logger(WorldGateway.name);
  private readonly localMap = createLocalMap();

  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(CharactersService) private readonly charactersService: CharactersService,
    @Inject(WorldStateService) private readonly worldStateService: WorldStateService
  ) {}

  afterInit(server: Server): void {
    server.use(async (socket, next) => {
      const worldSocket = socket as WorldSocket;
      const token = this.extractSocketToken(worldSocket);

      if (!token) {
        next(new Error("Missing authentication token"));
        return;
      }

      try {
        worldSocket.data.user = await this.authService.verifyAccessToken(token);
        next();
      } catch {
        next(new Error("Invalid or expired token"));
      }
    });
  }

  async handleDisconnect(client: WorldSocket): Promise<void> {
    const removedPlayer = this.worldStateService.removePlayer(client.id);

    if (!removedPlayer) {
      return;
    }

    await this.charactersService.savePositionForUserCharacter(
      removedPlayer.userId,
      removedPlayer.characterId,
      removedPlayer.position
    );

    const payload: PlayerLeftEvent = {
      characterId: removedPlayer.characterId
    };

    client.broadcast.emit(worldEventNames.playerLeft, payload);
  }

  @SubscribeMessage(worldEventNames.worldJoin)
  async handleWorldJoin(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: WorldJoinRequest
  ): Promise<void> {
    const user = client.data.user;

    if (!user) {
      this.emitWorldError(client, "Authentication is required.", "unauthenticated");
      return;
    }

    const characterId = payload?.characterId?.trim();

    if (!characterId) {
      this.emitWorldError(client, "A character id is required to join the world.", "invalid_character_id");
      return;
    }

    const activeCharacter = this.worldStateService.getPlayerByCharacterId(characterId);

    if (activeCharacter && activeCharacter.socketId !== client.id) {
      this.emitWorldError(client, "That character is already online.", "character_already_online");
      return;
    }

    const previousPlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (previousPlayer) {
      this.worldStateService.removePlayer(client.id);
      await this.charactersService.savePositionForUserCharacter(
        previousPlayer.userId,
        previousPlayer.characterId,
        previousPlayer.position
      );

      client.broadcast.emit(worldEventNames.playerLeft, {
        characterId: previousPlayer.characterId
      });
    }

    try {
      const character = await this.charactersService.findByIdForUser(user.id, characterId);
      const position = resolveLocalPlayerSpawn(this.localMap, character);
      const onlinePlayer = {
        socketId: client.id,
        userId: user.id,
        characterId: character.id,
        name: character.name,
        level: character.level,
        position
      };

      this.worldStateService.addPlayer(onlinePlayer);

      const worldPlayer = this.worldStateService.toWorldPlayer(onlinePlayer);

      const joinedPayload: WorldJoinedEvent = {
        player: worldPlayer
      };
      const playersPayload: WorldPlayersEvent = {
        players: this.worldStateService.listPlayers()
      };

      client.emit(worldEventNames.worldJoined, joinedPayload);
      client.emit(worldEventNames.worldPlayers, playersPayload);
      client.broadcast.emit(worldEventNames.playerJoined, {
        player: worldPlayer
      });
    } catch (error) {
      this.logger.warn(`Failed world join for socket ${client.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      this.emitWorldError(client, "Could not join the world with that character.", "world_join_failed");
    }
  }

  @SubscribeMessage(worldEventNames.playerMove)
  handlePlayerMove(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: PlayerMoveRequest
  ): void {
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!activePlayer) {
      this.emitWorldError(client, "Join the world before moving.", "world_join_required");
      return;
    }

    const direction = payload?.direction;

    if (!direction || !isMoveDirection(direction)) {
      this.emitWorldError(client, "Movement direction is invalid.", "invalid_move_direction");
      return;
    }

    const nextPosition = getNextPosition(activePlayer.position, direction);

    if (!isWalkableTile(this.localMap, nextPosition)) {
      return;
    }

    const updatedPlayer = this.worldStateService.updatePlayerPosition(client.id, nextPosition);

    if (!updatedPlayer) {
      return;
    }

    const movedPayload: PlayerMovedEvent = {
      player: this.worldStateService.toWorldPlayer(updatedPlayer)
    };

    this.server.emit(worldEventNames.playerMoved, movedPayload);
  }

  private extractSocketToken(socket: WorldSocket): string | null {
    const authToken = socket.handshake.auth?.token;

    if (typeof authToken === "string" && authToken.length > 0) {
      return authToken.startsWith("Bearer ") ? authToken.slice(7) : authToken;
    }

    const headerToken = socket.handshake.headers.authorization;
    return this.authService.extractBearerToken(headerToken);
  }

  private emitWorldError(client: WorldSocket, message: string, code?: string): void {
    const payload: WorldErrorEvent = { message, code };
    client.emit(worldEventNames.worldError, payload);
  }
}
