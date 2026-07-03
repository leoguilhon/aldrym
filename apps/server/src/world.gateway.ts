import type {
  AttackMonsterRequest,
  CharacterExperienceUpdatedEvent,
  CharacterLevelUpEvent,
  CombatErrorEvent,
  CombatStoppedEvent,
  MonsterDamagedEvent,
  MonsterDiedEvent,
  MonsterMovedEvent,
  MonsterRespawningEvent,
  MonsterRespawnedEvent,
  PlayerLeftEvent,
  PlayerMoveRequest,
  PlayerMovedEvent,
  Position,
  WorldClientToServerEvents,
  WorldErrorEvent,
  WorldJoinRequest,
  WorldJoinedEvent,
  WorldMonstersEvent,
  WorldPlayersEvent,
  WorldServerToClientEvents
} from "@aldrym/shared";
import {
  createLocalMap,
  getMovementCooldownMs,
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

interface CombatSession {
  monsterId: string;
  playerAttackTimer: ReturnType<typeof setInterval>;
}

const MONSTER_PURSUIT_RANGE = 8;
const PLAYER_SCREEN_TILE_HALF_HEIGHT = 5;
const PLAYER_SCREEN_TILE_HALF_WIDTH = 7;
const MONSTER_THINK_INTERVAL_MS = 700;
const PLAYER_ATTACK_INTERVAL_MS = 1200;
const RESPAWN_WARNING_MS = 3000;

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
  private readonly combatSessions = new Map<string, CombatSession>();
  private readonly nextPlayerAttackAtBySocketId = new Map<string, number>();
  private readonly nextPlayerMoveAtBySocketId = new Map<string, number>();
  private monsterThinkTimer: ReturnType<typeof setInterval> | null = null;

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

    this.monsterThinkTimer ??= setInterval(() => {
      this.performMonsterPursuitTick();
    }, MONSTER_THINK_INTERVAL_MS);
  }

  async handleDisconnect(client: WorldSocket): Promise<void> {
    this.stopCombatSession(client, "disconnected", false);
    this.nextPlayerAttackAtBySocketId.delete(client.id);
    this.nextPlayerMoveAtBySocketId.delete(client.id);

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
      this.nextPlayerAttackAtBySocketId.delete(client.id);
      this.nextPlayerMoveAtBySocketId.delete(client.id);
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

      this.nextPlayerAttackAtBySocketId.delete(client.id);
      this.nextPlayerMoveAtBySocketId.delete(client.id);
      this.worldStateService.addPlayer(onlinePlayer);

      const worldPlayer = this.worldStateService.toWorldPlayer(onlinePlayer);

      const joinedPayload: WorldJoinedEvent = {
        player: worldPlayer
      };
      const playersPayload: WorldPlayersEvent = {
        players: this.worldStateService.listPlayers()
      };
      const monstersPayload: WorldMonstersEvent = {
        monsters: this.worldStateService.listMonsters()
      };

      client.emit(worldEventNames.worldJoined, joinedPayload);
      client.emit(worldEventNames.worldPlayers, playersPayload);
      client.emit(worldEventNames.worldMonsters, monstersPayload);
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

    if (this.worldStateService.isAliveMonsterAt(nextPosition)) {
      return;
    }

    const now = Date.now();
    const nextMoveAt = this.nextPlayerMoveAtBySocketId.get(client.id) ?? 0;

    if (now < nextMoveAt) {
      return;
    }

    this.nextPlayerMoveAtBySocketId.set(client.id, now + getMovementCooldownMs(activePlayer.level, direction));

    const updatedPlayer = this.worldStateService.updatePlayerPosition(client.id, nextPosition);

    if (!updatedPlayer) {
      return;
    }

    const movedPayload: PlayerMovedEvent = {
      player: this.worldStateService.toWorldPlayer(updatedPlayer)
    };

    this.server.emit(worldEventNames.playerMoved, movedPayload);
  }

  @SubscribeMessage(worldEventNames.combatAttack)
  handleCombatAttack(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: AttackMonsterRequest
  ): void {
    const user = client.data.user;

    if (!user) {
      this.emitCombatError(client, "Authentication is required.", "unauthenticated");
      return;
    }

    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!activePlayer) {
      this.emitCombatError(client, "Join the world before attacking.", "world_join_required");
      return;
    }

    const monsterId = payload?.monsterId?.trim();

    if (!monsterId) {
      this.emitCombatError(client, "A monster id is required.", "invalid_monster_id");
      return;
    }

    const monster = this.worldStateService.getMonster(monsterId);

    if (!monster) {
      this.emitCombatError(client, "That monster does not exist.", "monster_not_found");
      return;
    }

    if (!monster.alive) {
      this.emitCombatError(client, "That monster is already defeated.", "monster_dead");
      return;
    }

    if (!this.isWithinPlayerScreen(activePlayer.position, monster)) {
      this.emitCombatError(client, "That monster is too far away to target.", "target_out_of_range");
      return;
    }

    const currentSession = this.combatSessions.get(client.id);

    if (currentSession?.monsterId === monster.id) {
      return;
    }

    this.stopCombatSession(client, "manual", false);
    this.startCombatSession(client, monster.id);
  }

  @SubscribeMessage(worldEventNames.combatStop)
  handleCombatStop(@ConnectedSocket() client: WorldSocket): void {
    this.stopCombatSession(client, "manual");
  }

  private startCombatSession(client: WorldSocket, monsterId: string): void {
    const playerAttackTimer = setInterval(() => {
      void this.performPlayerAttack(client, monsterId);
    }, PLAYER_ATTACK_INTERVAL_MS);

    this.combatSessions.set(client.id, {
      monsterId,
      playerAttackTimer
    });

    client.emit(worldEventNames.combatStarted, {
      monsterId
    });

    void this.performPlayerAttack(client, monsterId);
  }

  private stopCombatSession(
    client: WorldSocket,
    reason: CombatStoppedEvent["reason"],
    notify = true
  ): void {
    const session = this.combatSessions.get(client.id);

    if (!session) {
      return;
    }

    clearInterval(session.playerAttackTimer);
    this.combatSessions.delete(client.id);

    if (notify) {
      client.emit(worldEventNames.combatStopped, {
        monsterId: session.monsterId,
        reason
      });
    }
  }

  private async performPlayerAttack(client: WorldSocket, monsterId: string): Promise<void> {
    const user = client.data.user;
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);
    const monster = this.worldStateService.getMonster(monsterId);

    if (!user || !activePlayer || !monster) {
      this.stopCombatSession(client, "target_lost");
      return;
    }

    if (!monster.alive) {
      this.stopCombatSession(client, "target_dead");
      return;
    }

    if (!this.isWithinPlayerScreen(activePlayer.position, monster)) {
      this.stopCombatSession(client, "out_of_range");
      return;
    }

    if (!this.isAdjacent(activePlayer.position, monster)) {
      return;
    }

    const now = Date.now();
    const nextAttackAt = this.nextPlayerAttackAtBySocketId.get(client.id) ?? 0;

    if (now < nextAttackAt) {
      return;
    }

    this.nextPlayerAttackAtBySocketId.set(client.id, now + PLAYER_ATTACK_INTERVAL_MS);

    // Temporary MVP damage: original flat melee roll until combat stats exist.
    const damage = this.rollDamage(8, 16);
    const damagedMonster = this.worldStateService.damageMonster(monster.id, damage);

    if (!damagedMonster) {
      this.stopCombatSession(client, "target_lost");
      return;
    }

    const damagedPayload: MonsterDamagedEvent = {
      monsterId: damagedMonster.id,
      health: damagedMonster.health,
      maxHealth: damagedMonster.maxHealth,
      damage
    };

    this.server.emit(worldEventNames.monsterDamaged, damagedPayload);

    if (damagedMonster.alive) {
      return;
    }

    this.stopCombatSession(client, "target_dead");

    const diedPayload: MonsterDiedEvent = {
      monsterId: damagedMonster.id,
      monster: damagedMonster,
      experienceReward: damagedMonster.experienceReward
    };

    this.server.emit(worldEventNames.monsterDied, diedPayload);

    try {
      const result = await this.charactersService.addExperienceForUserCharacter(
        user.id,
        activePlayer.characterId,
        damagedMonster.experienceReward
      );
      const updatedCharacter = result.character;

      this.worldStateService.updatePlayerLevel(client.id, updatedCharacter.level);

      const experiencePayload: CharacterExperienceUpdatedEvent = {
        characterId: updatedCharacter.id,
        experience: updatedCharacter.experience,
        gainedExperience: damagedMonster.experienceReward,
        level: updatedCharacter.level,
        health: updatedCharacter.health,
        maxHealth: updatedCharacter.maxHealth,
        mana: updatedCharacter.mana,
        maxMana: updatedCharacter.maxMana
      };

      client.emit(worldEventNames.characterExperienceUpdated, experiencePayload);

      if (result.leveledUp) {
        const levelUpPayload: CharacterLevelUpEvent = {
          characterId: updatedCharacter.id,
          level: updatedCharacter.level,
          health: updatedCharacter.health,
          maxHealth: updatedCharacter.maxHealth,
          mana: updatedCharacter.mana,
          maxMana: updatedCharacter.maxMana
        };

        client.emit(worldEventNames.characterLevelUp, levelUpPayload);
      }
    } catch (error) {
      this.logger.warn(`Failed to apply combat reward for socket ${client.id}: ${error instanceof Error ? error.message : "unknown error"}`);
      this.emitCombatError(client, "The monster was defeated, but experience could not be saved.", "experience_update_failed");
    }

    this.scheduleMonsterRespawn(damagedMonster.id, damagedMonster.respawnMs);
  }

  private getNextMonsterPosition(monster: Position & { id: string }, target: Position): Position | null {
    const deltaX = target.x - monster.x;
    const deltaY = target.y - monster.y;
    const horizontalStep = deltaX === 0 ? null : { ...monster, x: monster.x + Math.sign(deltaX) };
    const verticalStep = deltaY === 0 ? null : { ...monster, y: monster.y + Math.sign(deltaY) };
    const candidates =
      Math.abs(deltaX) >= Math.abs(deltaY)
        ? [horizontalStep, verticalStep]
        : [verticalStep, horizontalStep];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      if (this.isSamePosition(candidate, target)) {
        continue;
      }

      if (!isWalkableTile(this.localMap, candidate)) {
        continue;
      }

      if (this.worldStateService.isAliveMonsterAt(candidate, monster.id)) {
        continue;
      }

      if (this.worldStateService.isPlayerAt(candidate)) {
        continue;
      }

      return candidate;
    }

    return null;
  }

  private performMonsterPursuitTick(): void {
    const players = this.worldStateService.listPlayers();

    if (players.length === 0) {
      return;
    }

    for (const monster of this.worldStateService.listMonsters()) {
      if (!monster.alive) {
        continue;
      }

      const target = this.findNearestPlayerInPursuitRange(monster, players);

      if (!target || this.isAdjacent(monster, target)) {
        continue;
      }

      const nextPosition = this.getNextMonsterPosition(monster, target);

      if (!nextPosition) {
        continue;
      }

      const movedMonster = this.worldStateService.moveMonster(monster.id, nextPosition);

      if (!movedMonster) {
        continue;
      }

      const movedPayload: MonsterMovedEvent = {
        monster: movedMonster
      };

      this.server.emit(worldEventNames.monsterMoved, movedPayload);
    }
  }

  private findNearestPlayerInPursuitRange<TPlayer extends Position>(monster: Position, players: TPlayer[]): TPlayer | null {
    let nearestPlayer: TPlayer | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const player of players) {
      const distance = this.getTileDistance(monster, player);

      if (distance === null || distance > MONSTER_PURSUIT_RANGE || distance >= nearestDistance) {
        continue;
      }

      nearestPlayer = player;
      nearestDistance = distance;
    }

    return nearestPlayer;
  }

  private scheduleMonsterRespawn(monsterId: string, respawnMs: number): void {
    const warningDelayMs = Math.max(0, respawnMs - RESPAWN_WARNING_MS);

    setTimeout(() => {
      const monster = this.worldStateService.getMonster(monsterId);

      if (!monster || monster.alive || !monster.respawnDueAt) {
        return;
      }

      const payload: MonsterRespawningEvent = {
        monsterId,
        x: monster.spawnX,
        y: monster.spawnY,
        z: monster.spawnZ,
        respawnDueAt: monster.respawnDueAt
      };

      this.server.emit(worldEventNames.monsterRespawning, payload);
    }, warningDelayMs);

    setTimeout(() => {
      this.tryRespawnMonster(monsterId);
    }, respawnMs);
  }

  private tryRespawnMonster(monsterId: string): void {
    const monster = this.worldStateService.getMonster(monsterId);

    if (!monster || monster.alive) {
      return;
    }

    const spawnPosition = { x: monster.spawnX, y: monster.spawnY, z: monster.spawnZ };

    if (this.worldStateService.isPlayerAt(spawnPosition) || this.worldStateService.isAliveMonsterAt(spawnPosition, monsterId)) {
      this.scheduleMonsterRespawn(monsterId, RESPAWN_WARNING_MS);
      return;
    }

    const respawnedMonster = this.worldStateService.respawnMonster(monsterId);

    if (!respawnedMonster) {
      return;
    }

    const respawnPayload: MonsterRespawnedEvent = {
      monster: respawnedMonster
    };

    this.server.emit(worldEventNames.monsterRespawned, respawnPayload);
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

  private emitCombatError(client: WorldSocket, message: string, code?: string): void {
    const payload: CombatErrorEvent = { message, code };
    client.emit(worldEventNames.combatError, payload);
  }

  private isAdjacent(attacker: Position, target: Position): boolean {
    return attacker.z === target.z && Math.abs(attacker.x - target.x) + Math.abs(attacker.y - target.y) === 1;
  }

  private isWithinPursuitRange(attacker: Position, target: Position): boolean {
    const distance = this.getTileDistance(attacker, target);
    return distance !== null && distance <= MONSTER_PURSUIT_RANGE;
  }

  private isWithinPlayerScreen(player: Position, target: Position): boolean {
    return (
      player.z === target.z &&
      Math.abs(player.x - target.x) <= PLAYER_SCREEN_TILE_HALF_WIDTH &&
      Math.abs(player.y - target.y) <= PLAYER_SCREEN_TILE_HALF_HEIGHT
    );
  }

  private getTileDistance(left: Position, right: Position): number | null {
    if (left.z !== right.z) {
      return null;
    }

    return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
  }

  private isSamePosition(left: Position, right: Position): boolean {
    return left.x === right.x && left.y === right.y && left.z === right.z;
  }

  private rollDamage(minimum: number, maximum: number): number {
    return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
  }
}
