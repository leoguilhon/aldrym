import type {
  AttackMonsterRequest,
  CharacterDamagedEvent,
  CharacterExperienceUpdatedEvent,
  CharacterLevelUpEvent,
  CharacterSummary,
  CharacterUpdatedEvent,
  ChaseMode,
  CombatStance,
  CombatErrorEvent,
  CombatStoppedEvent,
  ContainerCloseRequest,
  ContainerErrorEvent,
  ContainerOpenRequest,
  CorpseCreatedEvent,
  CorpseErrorEvent,
  CorpseAddItemRequest,
  CorpseDropItemRequest,
  CorpseMoveRequest,
  CorpseOpenRequest,
  CorpseRemovedEvent,
  CorpseTakeItemRequest,
  CorpseUpdatedEvent,
  EquipmentErrorEvent,
  GroundItemErrorEvent,
  GroundItemMoveRequest,
  GroundItemTakeRequest,
  InventoryErrorEvent,
  InventoryDropItemRequest,
  InventoryEquipItemRequest,
  InventoryMoveItemRequest,
  InventoryUseItemRequest,
  InventoryUnequipItemRequest,
  InventoryUpdatedEvent,
  MonsterDamagedEvent,
  MonsterDiedEvent,
  MonsterMovedEvent,
  MonsterRespawningEvent,
  MonsterRespawnedEvent,
  PlayerLeftEvent,
  PlayerMoveRequest,
  PlayerMovedEvent,
  Position,
  SetCombatStanceRequest,
  SetChaseModeRequest,
  SetPvpModeRequest,
  WorldClientToServerEvents,
  WorldCorpsesEvent,
  WorldErrorEvent,
  WorldGroundItemsEvent,
  WorldJoinRequest,
  WorldJoinedEvent,
  WorldMonstersEvent,
  WorldPlayersEvent,
  WorldServerToClientEvents
} from "@aldrym/shared";
import {
  combatStances,
  chaseModes,
  createLocalMap,
  getRegenerationPerSecond,
  getMovementCooldownMs,
  getNextPosition,
  getTileType,
  isMoveDirection,
  isProtectionZone,
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
import { CharactersService, InventoryFullError, InventoryValidationError } from "./characters/characters.service";
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
const PLAYER_ATTACK_INTERVAL_MS = 2000;
const MONSTER_ATTACK_INTERVAL_MS = 2000;
const PLAYER_REGENERATION_INTERVAL_MS = 1000;
const RESPAWN_WARNING_MS = 3000;
const EMPTY_CORPSE_DECAY_MS = 15000;
const ITEM_THROW_RANGE = 5;
const CORPSE_MOVE_RANGE = 2;

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
  private readonly corpseDecayTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lockedCorpseIds = new Set<string>();
  private readonly lockedCorpseItemKeys = new Set<string>();
  private readonly lockedGroundItemIds = new Set<string>();
  private readonly playerCombatStanceBySocketId = new Map<string, CombatStance>();
  private readonly playerChaseModeBySocketId = new Map<string, ChaseMode>();
  private readonly playerPvpModeBySocketId = new Map<string, boolean>();
  private readonly playerFoodExpiresAtBySocketId = new Map<string, number>();
  private readonly playerHealthRegenCarryBySocketId = new Map<string, number>();
  private readonly playerManaRegenCarryBySocketId = new Map<string, number>();
  private readonly nextMonsterAttackAtByMonsterId = new Map<string, number>();
  private readonly nextPlayerAttackAtBySocketId = new Map<string, number>();
  private readonly nextPlayerMoveAtBySocketId = new Map<string, number>();
  private readonly openedContainerIdsBySocketId = new Map<string, Set<string>>();
  private monsterThinkTimer: ReturnType<typeof setInterval> | null = null;
  private playerRegenerationTimer: ReturnType<typeof setInterval> | null = null;

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
      void this.performMonsterPursuitTick();
    }, MONSTER_THINK_INTERVAL_MS);
    this.playerRegenerationTimer ??= setInterval(() => {
      void this.performPlayerRegenerationTick();
    }, PLAYER_REGENERATION_INTERVAL_MS);
  }

  async handleDisconnect(client: WorldSocket): Promise<void> {
    this.stopCombatSession(client, "disconnected", false);
    this.nextPlayerAttackAtBySocketId.delete(client.id);
    this.nextPlayerMoveAtBySocketId.delete(client.id);
    this.openedContainerIdsBySocketId.delete(client.id);
    this.playerCombatStanceBySocketId.delete(client.id);
    this.playerChaseModeBySocketId.delete(client.id);
    this.playerPvpModeBySocketId.delete(client.id);
    this.playerFoodExpiresAtBySocketId.delete(client.id);
    this.playerHealthRegenCarryBySocketId.delete(client.id);
    this.playerManaRegenCarryBySocketId.delete(client.id);

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
      this.openedContainerIdsBySocketId.delete(client.id);
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
      const character = await this.charactersService.findByIdForUser(user.id, characterId, "balanced");
      const position = resolveLocalPlayerSpawn(this.localMap, character);
      const onlinePlayer = {
        socketId: client.id,
        userId: user.id,
        characterId: character.id,
        characterClass: character.characterClass,
        name: character.name,
        level: character.level,
        health: character.health,
        maxHealth: character.maxHealth,
        mana: character.mana,
        maxMana: character.maxMana,
        position
      };

      this.nextPlayerAttackAtBySocketId.delete(client.id);
      this.nextPlayerMoveAtBySocketId.delete(client.id);
      this.playerCombatStanceBySocketId.set(client.id, "balanced");
      this.playerChaseModeBySocketId.set(client.id, "stand");
      this.playerPvpModeBySocketId.set(client.id, false);
      this.playerFoodExpiresAtBySocketId.set(client.id, character.food.foodExpiresAt ? Date.parse(character.food.foodExpiresAt) : 0);
      this.playerHealthRegenCarryBySocketId.set(client.id, 0);
      this.playerManaRegenCarryBySocketId.set(client.id, 0);
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
      const corpsesPayload: WorldCorpsesEvent = {
        corpses: this.worldStateService.listCorpses()
      };
      const groundItemsPayload: WorldGroundItemsEvent = {
        groundItems: this.worldStateService.listGroundItems()
      };
      const inventoryPayload: InventoryUpdatedEvent = {
        items: await this.charactersService.listInventoryForUserCharacter(user.id, character.id)
      };
      const equipmentPayload = {
        slots: await this.charactersService.listEquipmentForUserCharacter(user.id, character.id)
      };

      client.emit(worldEventNames.worldJoined, joinedPayload);
      client.emit(worldEventNames.worldPlayers, playersPayload);
      client.emit(worldEventNames.worldMonsters, monstersPayload);
      client.emit(worldEventNames.worldCorpses, corpsesPayload);
      client.emit(worldEventNames.worldGroundItems, groundItemsPayload);
      client.emit(worldEventNames.inventoryUpdated, inventoryPayload);
      client.emit(worldEventNames.equipmentUpdated, equipmentPayload);
      client.emit(worldEventNames.characterUpdated, {
        character
      });
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

    this.playerChaseModeBySocketId.set(client.id, "stand");

    const movedPayload: PlayerMovedEvent = {
      player: this.worldStateService.toWorldPlayer(updatedPlayer)
    };

    this.server.emit(worldEventNames.playerMoved, movedPayload);

    if (isProtectionZone(this.localMap, nextPosition)) {
      this.stopCombatSession(client, "target_lost");
    }
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

    if (isProtectionZone(this.localMap, activePlayer.position) || isProtectionZone(this.localMap, monster)) {
      this.emitCombatError(client, "Combat is not allowed in a protection zone.", "protection_zone");
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

  @SubscribeMessage(worldEventNames.combatSetStance)
  async handleCombatSetStance(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: SetCombatStanceRequest
  ): Promise<void> {
    const user = client.data.user;
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);
    const stance = payload?.stance;

    if (!user || !activePlayer) {
      this.emitCombatError(client, "Join the world before changing your combat stance.", "world_join_required");
      return;
    }

    if (!stance || !combatStances.includes(stance)) {
      this.emitCombatError(client, "That combat stance does not exist.", "invalid_combat_stance");
      return;
    }

    this.playerCombatStanceBySocketId.set(client.id, stance);
    await this.emitCharacterState(client, user.id, activePlayer.characterId);
  }

  @SubscribeMessage(worldEventNames.combatSetChaseMode)
  handleCombatSetChaseMode(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: SetChaseModeRequest
  ): void {
    if (!this.worldStateService.getPlayerBySocketId(client.id)) {
      this.emitCombatError(client, "Join the world before changing chase mode.", "world_join_required");
      return;
    }

    if (!payload?.mode || !chaseModes.includes(payload.mode)) {
      this.emitCombatError(client, "That chase mode does not exist.", "invalid_chase_mode");
      return;
    }

    this.playerChaseModeBySocketId.set(client.id, payload.mode);
  }

  @SubscribeMessage(worldEventNames.combatSetPvpMode)
  handleCombatSetPvpMode(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: SetPvpModeRequest
  ): void {
    if (!this.worldStateService.getPlayerBySocketId(client.id)) {
      this.emitCombatError(client, "Join the world before changing PvP mode.", "world_join_required");
      return;
    }

    if (typeof payload?.enabled !== "boolean") {
      this.emitCombatError(client, "PvP mode is invalid.", "invalid_pvp_mode");
      return;
    }

    this.playerPvpModeBySocketId.set(client.id, payload.enabled);
  }

  @SubscribeMessage(worldEventNames.corpseOpen)
  handleCorpseOpen(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: CorpseOpenRequest
  ): void {
    const user = client.data.user;

    if (!user) {
      this.emitCorpseError(client, "Authentication is required.", "unauthenticated");
      return;
    }

    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!activePlayer) {
      this.emitCorpseError(client, "Join the world before opening corpses.", "world_join_required");
      return;
    }

    const corpseId = payload?.corpseId?.trim();

    if (!corpseId) {
      this.emitCorpseError(client, "A corpse id is required.", "invalid_corpse_id");
      return;
    }

    const corpse = this.worldStateService.getCorpse(corpseId);

    if (!corpse) {
      this.emitCorpseError(client, "That corpse is gone.", "corpse_not_found");
      return;
    }

    if (!this.isInDirectContact(activePlayer.position, corpse)) {
      this.emitCorpseError(client, "You need to stand on the corpse tile or on any adjacent tile.", "corpse_too_far");
      return;
    }

    client.emit(worldEventNames.corpseOpened, {
      corpse
    });
  }

  @SubscribeMessage(worldEventNames.corpseMove)
  handleCorpseMove(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: CorpseMoveRequest
  ): void {
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!activePlayer) {
      this.emitCorpseError(client, "Join the world before moving corpses.", "world_join_required");
      return;
    }

    const corpseId = payload?.corpseId?.trim();
    const targetPosition = this.normalizeDropPosition(payload?.position);

    if (!corpseId || !targetPosition) {
      this.emitCorpseError(client, "A corpse and valid tile are required.", "invalid_corpse_move_request");
      return;
    }

    if (!this.tryLockCorpse(corpseId)) {
      this.emitCorpseError(client, "That corpse is already being updated.", "corpse_busy");
      return;
    }

    try {
      const corpse = this.worldStateService.getCorpse(corpseId);

      if (!corpse) {
        this.emitCorpseError(client, "That corpse is gone.", "corpse_not_found");
        return;
      }

      if (!this.isInDirectContact(activePlayer.position, corpse)) {
        this.emitCorpseError(client, "You need to stand on the corpse tile or on any adjacent tile.", "corpse_too_far");
        return;
      }

      if (!this.isWithinCorpseMoveRange(activePlayer.position, targetPosition)) {
        this.emitCorpseError(client, "You can only move corpses up to 2 SQM away.", "corpse_move_tile_too_far");
        return;
      }

      if (!this.hasLineOfSight(activePlayer.position, targetPosition)) {
        this.emitCorpseError(client, "A wall blocks that drag.", "corpse_move_line_blocked");
        return;
      }

      if (!isWalkableTile(this.localMap, targetPosition)) {
        this.emitCorpseError(client, "Corpses cannot be moved there.", "corpse_move_tile_blocked");
        return;
      }

      if (this.worldStateService.isAliveMonsterAt(targetPosition)) {
        this.emitCorpseError(client, "A creature blocks that tile.", "corpse_move_tile_occupied");
        return;
      }

      const movedCorpse = this.worldStateService.moveCorpse(corpse.id, targetPosition);

      if (!movedCorpse) {
        this.emitCorpseError(client, "That corpse is gone.", "corpse_not_found");
        return;
      }

      this.server.emit(worldEventNames.corpseUpdated, {
        corpse: movedCorpse
      });
    } finally {
      this.releaseCorpseLock(corpseId);
    }
  }

  @SubscribeMessage(worldEventNames.corpseTakeItem)
  async handleCorpseTakeItem(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: CorpseTakeItemRequest
  ): Promise<void> {
    const user = client.data.user;

    if (!user) {
      this.emitInventoryError(client, "Authentication is required.", "unauthenticated");
      return;
    }

    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!activePlayer) {
      this.emitInventoryError(client, "Join the world before taking loot.", "world_join_required");
      return;
    }

    const corpseId = payload?.corpseId?.trim();
    const corpseItemId = payload?.corpseItemId?.trim();
    const quantity = Math.floor(payload?.quantity ?? 0);

    if (!corpseId || !corpseItemId) {
      this.emitCorpseError(client, "A corpse and item id are required.", "invalid_corpse_item_request");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      this.emitCorpseError(client, "Loot quantity is invalid.", "invalid_quantity");
      return;
    }

    const corpseItemLockKey = this.getCorpseItemLockKey(corpseId, corpseItemId);

    if (!this.tryLockCorpseItem(corpseItemLockKey)) {
      this.emitCorpseError(client, "That loot is already being moved.", "corpse_item_busy");
      return;
    }

    try {
      const corpse = this.worldStateService.getCorpse(corpseId);

      if (!corpse) {
        this.emitCorpseError(client, "That corpse is gone.", "corpse_not_found");
        return;
      }

      if (!this.isInDirectContact(activePlayer.position, corpse)) {
        this.emitCorpseError(client, "You need to stand on the corpse tile or on any adjacent tile.", "corpse_too_far");
        return;
      }

      const corpseItem = corpse.items.find((item) => item.corpseItemId === corpseItemId);

      if (!corpseItem) {
        this.emitCorpseError(client, "That loot is no longer in the corpse.", "corpse_item_not_found");
        return;
      }

      if (quantity > corpseItem.quantity) {
        this.emitCorpseError(client, "That corpse does not contain that many items.", "invalid_quantity");
        return;
      }

      const takeResult = this.worldStateService.takeCorpseItem(corpse.id, corpseItem.corpseItemId, quantity);

      if (!takeResult) {
        this.emitCorpseError(client, "That loot is no longer in the corpse.", "corpse_item_not_found");
        return;
      }

      try {
        if (payload.target) {
          await this.charactersService.addGroundItemToTargetForUserCharacter(
            user.id,
            activePlayer.characterId,
            takeResult.item,
            takeResult.item.quantity,
            payload.target
          );
        } else {
          await this.charactersService.addItemToInventoryForUserCharacter(
            user.id,
            activePlayer.characterId,
            takeResult.item,
            takeResult.item.quantity
          );
        }

        await this.emitInventoryState(client, user.id, activePlayer.characterId, `Took ${takeResult.item.quantity} ${takeResult.item.name}.`);

        client.emit(worldEventNames.corpseUpdated, {
          corpse: takeResult.corpse
        });
        this.server.emit(worldEventNames.corpseUpdated, {
          corpse: takeResult.corpse
        });

        if (takeResult.corpse.isEmpty) {
          this.scheduleCorpseDecay(takeResult.corpse.id, EMPTY_CORPSE_DECAY_MS);
        }
      } catch (error) {
        const restoredCorpse = this.worldStateService.restoreCorpseItem(corpse.id, takeResult.item);
        if (restoredCorpse) {
          this.server.emit(worldEventNames.corpseUpdated, {
            corpse: restoredCorpse
          });
        }
        if (error instanceof InventoryFullError) {
          this.emitInventoryError(client, "Your inventory is full.", "inventory_full");
          return;
        }
        if (error instanceof InventoryValidationError) {
          this.emitInventoryError(client, error.message, error.code);
          return;
        }
        this.logger.warn(`Failed to take corpse item for socket ${client.id}: ${error instanceof Error ? error.message : "unknown error"}`);
        this.emitInventoryError(client, "The item could not be added to your inventory.", "inventory_update_failed");
      }
    } finally {
      this.releaseCorpseItemLock(corpseItemLockKey);
    }
  }

  @SubscribeMessage(worldEventNames.corpseDropItem)
  async handleCorpseDropItem(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: CorpseDropItemRequest
  ): Promise<void> {
    const user = client.data.user;
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!user || !activePlayer) {
      this.emitCorpseError(client, "Join the world before moving loot.", "world_join_required");
      return;
    }

    const corpseId = payload?.corpseId?.trim();
    const corpseItemId = payload?.corpseItemId?.trim();
    const quantity = Math.floor(payload?.quantity ?? 0);
    const targetPosition = this.normalizeDropPosition(payload?.position);

    if (!corpseId || !corpseItemId || !targetPosition) {
      this.emitCorpseError(client, "A corpse item and valid drop tile are required.", "invalid_corpse_drop_request");
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      this.emitCorpseError(client, "Loot quantity is invalid.", "invalid_quantity");
      return;
    }

    if (!this.isWithinItemThrowRange(activePlayer.position, targetPosition)) {
      this.emitCorpseError(client, "You can only drop loot up to 5 SQM away.", "corpse_drop_tile_too_far");
      return;
    }

    if (!this.hasLineOfSight(activePlayer.position, targetPosition)) {
      this.emitCorpseError(client, "A wall blocks that throw.", "corpse_drop_line_blocked");
      return;
    }

    if (!isWalkableTile(this.localMap, targetPosition)) {
      this.emitCorpseError(client, "Loot cannot be dropped there.", "corpse_drop_tile_blocked");
      return;
    }

    const corpseItemLockKey = this.getCorpseItemLockKey(corpseId, corpseItemId);

    if (!this.tryLockCorpseItem(corpseItemLockKey)) {
      this.emitCorpseError(client, "That loot is already being moved.", "corpse_item_busy");
      return;
    }

    try {
      const corpse = this.worldStateService.getCorpse(corpseId);

      if (!corpse) {
        this.emitCorpseError(client, "That corpse is gone.", "corpse_not_found");
        return;
      }

      if (!this.isInDirectContact(activePlayer.position, corpse)) {
        this.emitCorpseError(client, "You need to stand on the corpse tile or on any adjacent tile.", "corpse_too_far");
        return;
      }

      const corpseItem = corpse.items.find((item) => item.corpseItemId === corpseItemId);

      if (!corpseItem) {
        this.emitCorpseError(client, "That loot is no longer in the corpse.", "corpse_item_not_found");
        return;
      }

      if (quantity > corpseItem.quantity) {
        this.emitCorpseError(client, "That corpse does not contain that many items.", "invalid_quantity");
        return;
      }

      const takeResult = this.worldStateService.takeCorpseItem(corpse.id, corpseItem.corpseItemId, quantity);

      if (!takeResult) {
        this.emitCorpseError(client, "That loot is no longer in the corpse.", "corpse_item_not_found");
        return;
      }

      const { corpseItemId: _corpseItemId, ...groundDropItem } = takeResult.item;
      const groundItem = this.worldStateService.createGroundItem(groundDropItem, targetPosition);

      this.server.emit(worldEventNames.groundItemCreated, {
        groundItem
      });
      client.emit(worldEventNames.corpseUpdated, {
        corpse: takeResult.corpse
      });
      this.server.emit(worldEventNames.corpseUpdated, {
        corpse: takeResult.corpse
      });

      if (takeResult.corpse.isEmpty) {
        this.scheduleCorpseDecay(takeResult.corpse.id, EMPTY_CORPSE_DECAY_MS);
      }
    } finally {
      this.releaseCorpseItemLock(corpseItemLockKey);
    }
  }

  @SubscribeMessage(worldEventNames.corpseAddItem)
  async handleCorpseAddItem(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: CorpseAddItemRequest
  ): Promise<void> {
    const user = client.data.user;
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!user || !activePlayer) {
      this.emitCorpseError(client, "Join the world before moving items into corpses.", "world_join_required");
      return;
    }

    const corpseId = payload?.corpseId?.trim();
    const itemId = payload?.itemId?.trim();

    if (!corpseId || !itemId) {
      this.emitCorpseError(client, "A corpse and item id are required.", "invalid_corpse_item_request");
      return;
    }

    if (!this.tryLockCorpse(corpseId)) {
      this.emitCorpseError(client, "That corpse is already being updated.", "corpse_busy");
      return;
    }

    try {
      const corpse = this.worldStateService.getCorpse(corpseId);

      if (!corpse) {
        this.emitCorpseError(client, "That corpse is gone.", "corpse_not_found");
        return;
      }

      if (!this.isInDirectContact(activePlayer.position, corpse)) {
        this.emitCorpseError(client, "You need to stand on the corpse tile or on any adjacent tile.", "corpse_too_far");
        return;
      }

      const inspectedItem = await this.charactersService.inspectDroppableItemForUserCharacter(user.id, activePlayer.characterId, itemId);
      const canAddItem = this.worldStateService.canAddCorpseItem(corpse.id, inspectedItem);

      if (canAddItem === null) {
        this.emitCorpseError(client, "That corpse is gone.", "corpse_not_found");
        return;
      }

      if (!canAddItem) {
        this.emitCorpseError(client, "That corpse is full.", "corpse_full");
        return;
      }

      const droppedItem = await this.charactersService.removeItemForGroundDrop(user.id, activePlayer.characterId, itemId);
      const updatedCorpse = this.worldStateService.addCorpseItem(corpse.id, droppedItem);

      if (!updatedCorpse) {
        this.emitCorpseError(client, "That corpse cannot hold that item.", "corpse_add_failed");
        return;
      }

      await this.emitInventoryState(client, user.id, activePlayer.characterId, `Moved ${droppedItem.name} into the corpse.`);
      client.emit(worldEventNames.corpseUpdated, {
        corpse: updatedCorpse
      });
      this.server.emit(worldEventNames.corpseUpdated, {
        corpse: updatedCorpse
      });
    } catch (error) {
      this.emitInventoryOperationError(client, error);
    } finally {
      this.releaseCorpseLock(corpseId);
    }
  }

  @SubscribeMessage(worldEventNames.inventoryMoveItem)
  async handleInventoryMoveItem(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: InventoryMoveItemRequest
  ): Promise<void> {
    const user = client.data.user;
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!user || !activePlayer) {
      this.emitInventoryError(client, "Join the world before moving items.", "world_join_required");
      return;
    }

    const itemId = payload?.itemId?.trim();

    if (!itemId || !payload?.target) {
      this.emitInventoryError(client, "An item and target are required.", "invalid_inventory_move");
      return;
    }

    try {
      await this.charactersService.moveItemForUserCharacter(user.id, activePlayer.characterId, itemId, payload.target);
      await this.emitInventoryState(client, user.id, activePlayer.characterId, "Inventory updated.");
    } catch (error) {
      this.emitInventoryOperationError(client, error);
    }
  }

  @SubscribeMessage(worldEventNames.inventoryEquipItem)
  async handleInventoryEquipItem(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: InventoryEquipItemRequest
  ): Promise<void> {
    const user = client.data.user;
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!user || !activePlayer) {
      this.emitEquipmentError(client, "Join the world before equipping items.", "world_join_required");
      return;
    }

    const itemId = payload?.itemId?.trim();

    if (!itemId) {
      this.emitEquipmentError(client, "An item id is required.", "invalid_item_id");
      return;
    }

    try {
      await this.charactersService.equipItemForUserCharacter(user.id, activePlayer.characterId, itemId, payload.equipmentSlot);
      await this.emitInventoryState(client, user.id, activePlayer.characterId, "Equipment updated.");
    } catch (error) {
      this.emitEquipmentOperationError(client, error);
    }
  }

  @SubscribeMessage(worldEventNames.inventoryUseItem)
  async handleInventoryUseItem(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: InventoryUseItemRequest
  ): Promise<void> {
    const user = client.data.user;
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);
    const itemId = payload?.itemId?.trim();

    if (!user || !activePlayer) {
      this.emitInventoryError(client, "Join the world before using items.", "world_join_required");
      return;
    }

    if (!itemId) {
      this.emitInventoryError(client, "An item id is required.", "invalid_item_id");
      return;
    }

    try {
      const result = await this.charactersService.useItemForUserCharacter(
        user.id,
        activePlayer.characterId,
        itemId,
        this.getCombatStance(client.id)
      );

      await this.emitInventoryState(client, user.id, activePlayer.characterId, result.message, result.character);
    } catch (error) {
      this.emitInventoryOperationError(client, error);
    }
  }

  @SubscribeMessage(worldEventNames.inventoryUnequipItem)
  async handleInventoryUnequipItem(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: InventoryUnequipItemRequest
  ): Promise<void> {
    const user = client.data.user;
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!user || !activePlayer) {
      this.emitEquipmentError(client, "Join the world before unequipping items.", "world_join_required");
      return;
    }

    if (!payload?.equipmentSlot) {
      this.emitEquipmentError(client, "An equipment slot is required.", "invalid_equipment_slot");
      return;
    }

    try {
      await this.charactersService.unequipItemForUserCharacter(user.id, activePlayer.characterId, payload.equipmentSlot, payload.target);
      await this.emitInventoryState(client, user.id, activePlayer.characterId, "Equipment updated.");
    } catch (error) {
      this.emitEquipmentOperationError(client, error);
    }
  }

  @SubscribeMessage(worldEventNames.inventoryDropItem)
  async handleInventoryDropItem(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: InventoryDropItemRequest
  ): Promise<void> {
    const user = client.data.user;
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!user || !activePlayer) {
      this.emitInventoryError(client, "Join the world before dropping items.", "world_join_required");
      return;
    }

    const itemId = payload?.itemId?.trim();
    const targetPosition = this.normalizeDropPosition(payload?.position);

    if (!itemId) {
      this.emitInventoryError(client, "An item id is required.", "invalid_item_id");
      return;
    }

    if (!targetPosition) {
      this.emitInventoryError(client, "A valid drop tile is required.", "invalid_drop_position");
      return;
    }

    if (!this.isWithinItemThrowRange(activePlayer.position, targetPosition)) {
      this.emitInventoryError(client, "You can only drop items up to 5 SQM away.", "drop_tile_too_far");
      return;
    }

    if (!this.hasLineOfSight(activePlayer.position, targetPosition)) {
      this.emitInventoryError(client, "A wall blocks that throw.", "drop_line_blocked");
      return;
    }

    if (!isWalkableTile(this.localMap, targetPosition)) {
      this.emitInventoryError(client, "Items cannot be dropped there.", "drop_tile_blocked");
      return;
    }

    try {
      const droppedItem = await this.charactersService.removeItemForGroundDrop(user.id, activePlayer.characterId, itemId);
      const groundItem = this.worldStateService.createGroundItem(droppedItem, targetPosition);

      this.server.emit(worldEventNames.groundItemCreated, {
        groundItem
      });
      await this.emitInventoryState(client, user.id, activePlayer.characterId, `Dropped ${droppedItem.name}.`);
    } catch (error) {
      this.emitInventoryOperationError(client, error);
    }
  }

  @SubscribeMessage(worldEventNames.groundItemMove)
  handleGroundItemMove(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: GroundItemMoveRequest
  ): void {
    const user = client.data.user;
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!user || !activePlayer) {
      this.emitGroundItemError(client, "Join the world before moving ground items.", "world_join_required");
      return;
    }

    const groundItemId = payload?.groundItemId?.trim();
    const targetPosition = this.normalizeDropPosition(payload?.position);

    if (!groundItemId || !targetPosition) {
      this.emitGroundItemError(client, "A ground item and valid tile are required.", "invalid_ground_item_move");
      return;
    }

    if (!this.tryLockGroundItem(groundItemId)) {
      this.emitGroundItemError(client, "That item is already being moved.", "ground_item_busy");
      return;
    }

    try {
      const groundItem = this.worldStateService.getGroundItem(groundItemId);

      if (!groundItem) {
        this.emitGroundItemError(client, "That item is no longer on the ground.", "ground_item_not_found");
        return;
      }

      if (!this.isInDirectContact(activePlayer.position, groundItem)) {
        this.emitGroundItemError(client, "Stand on or next to the item before moving it.", "ground_item_too_far");
        return;
      }

      if (!this.isWithinItemThrowRange(activePlayer.position, targetPosition)) {
        this.emitGroundItemError(client, "You can only move ground items up to 5 SQM away.", "ground_item_target_too_far");
        return;
      }

      if (!this.hasLineOfSight(activePlayer.position, groundItem) || !this.hasLineOfSight(activePlayer.position, targetPosition)) {
        this.emitGroundItemError(client, "A wall blocks that movement.", "ground_item_line_blocked");
        return;
      }

      if (!isWalkableTile(this.localMap, targetPosition)) {
        this.emitGroundItemError(client, "Items cannot be moved there.", "ground_item_tile_blocked");
        return;
      }

      const movedGroundItem = this.worldStateService.moveGroundItem(groundItem.id, targetPosition);

      if (!movedGroundItem) {
        this.emitGroundItemError(client, "That item is no longer on the ground.", "ground_item_not_found");
        return;
      }

      this.server.emit(worldEventNames.groundItemCreated, {
        groundItem: movedGroundItem
      });
    } finally {
      this.releaseGroundItemLock(groundItemId);
    }
  }

  @SubscribeMessage(worldEventNames.groundItemTake)
  async handleGroundItemTake(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: GroundItemTakeRequest
  ): Promise<void> {
    const user = client.data.user;
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!user || !activePlayer) {
      this.emitGroundItemError(client, "Join the world before taking ground items.", "world_join_required");
      return;
    }

    const groundItemId = payload?.groundItemId?.trim();

    if (!groundItemId) {
      this.emitGroundItemError(client, "A ground item id is required.", "invalid_ground_item_id");
      return;
    }

    if (!this.tryLockGroundItem(groundItemId)) {
      this.emitGroundItemError(client, "That item is already being moved.", "ground_item_busy");
      return;
    }

    try {
      const groundItem = this.worldStateService.getGroundItem(groundItemId);

      if (!groundItem) {
        this.emitGroundItemError(client, "That item is no longer on the ground.", "ground_item_not_found");
        return;
      }

      if (!this.isWithinItemThrowRange(activePlayer.position, groundItem)) {
        this.emitGroundItemError(client, "You need to be within 5 SQM of that item.", "ground_item_too_far");
        return;
      }

      if (!this.hasLineOfSight(activePlayer.position, groundItem)) {
        this.emitGroundItemError(client, "A wall blocks that item.", "ground_item_line_blocked");
        return;
      }

      const takenGroundItem = this.worldStateService.takeGroundItem(groundItem.id);

      if (!takenGroundItem) {
        this.emitGroundItemError(client, "That item is no longer on the ground.", "ground_item_not_found");
        return;
      }

      try {
        if (payload.target) {
          await this.charactersService.addGroundItemToTargetForUserCharacter(
            user.id,
            activePlayer.characterId,
            takenGroundItem,
            takenGroundItem.quantity,
            payload.target
          );
        } else {
          await this.charactersService.addItemToInventoryForUserCharacter(
            user.id,
            activePlayer.characterId,
            takenGroundItem,
            takenGroundItem.quantity
          );
        }

        this.server.emit(worldEventNames.groundItemRemoved, {
          groundItemId: takenGroundItem.id
        });
        await this.emitInventoryState(client, user.id, activePlayer.characterId, `Picked up ${takenGroundItem.name}.`);
      } catch (error) {
        const restoredGroundItem = this.worldStateService.restoreGroundItem(takenGroundItem);
        this.server.emit(worldEventNames.groundItemCreated, {
          groundItem: restoredGroundItem
        });

        if (error instanceof InventoryFullError) {
          this.emitGroundItemError(client, "Your backpack is full.", "inventory_full");
          return;
        }

        if (error instanceof InventoryValidationError) {
          this.emitGroundItemError(client, error.message, error.code);
          return;
        }

        this.logger.warn(`Failed to take ground item for socket ${client.id}: ${error instanceof Error ? error.message : "unknown error"}`);
        this.emitGroundItemError(client, "The item could not be picked up.", "ground_item_take_failed");
      }
    } finally {
      this.releaseGroundItemLock(groundItemId);
    }
  }

  @SubscribeMessage(worldEventNames.containerOpen)
  async handleContainerOpen(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: ContainerOpenRequest
  ): Promise<void> {
    const user = client.data.user;
    const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);

    if (!user || !activePlayer) {
      this.emitContainerError(client, "Join the world before opening containers.", "world_join_required");
      return;
    }

    const containerItemId = payload?.containerItemId?.trim();

    if (!containerItemId) {
      this.emitContainerError(client, "A container id is required.", "invalid_container_id");
      return;
    }

    try {
      const containerState = await this.charactersService.openContainerForUserCharacter(user.id, activePlayer.characterId, containerItemId);
      this.getOpenedContainerIds(client.id).add(containerItemId);
      client.emit(worldEventNames.containerOpened, containerState);
    } catch (error) {
      this.emitContainerOperationError(client, error);
    }
  }

  @SubscribeMessage(worldEventNames.containerClose)
  handleContainerClose(
    @ConnectedSocket() client: WorldSocket,
    @MessageBody() payload: ContainerCloseRequest
  ): void {
    const containerItemId = payload?.containerItemId?.trim();

    if (!containerItemId) {
      return;
    }

    this.openedContainerIdsBySocketId.get(client.id)?.delete(containerItemId);
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

    if (isProtectionZone(this.localMap, activePlayer.position) || isProtectionZone(this.localMap, monster)) {
      this.stopCombatSession(client, "target_lost");
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
    const stance = this.getCombatStance(client.id);
    const character = await this.charactersService.findByIdForUser(user.id, activePlayer.characterId, stance);
    const rawDamage = this.rollDamage(0, Math.max(0, character.combatStats.attackValue * 2));
    const armorReduction = this.rollArmorReduction(monster.armor, rawDamage);
    const damage = Math.max(0, rawDamage - armorReduction);
    const skilledCharacter = await this.charactersService.addSkillProgressForUserCharacter(
      user.id,
      activePlayer.characterId,
      character.combatStats.attackSkill,
      1,
      stance
    );

    await this.emitCharacterState(client, user.id, activePlayer.characterId, skilledCharacter);

    if (damage <= 0) {
      return;
    }

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

    const corpse = this.worldStateService.createCorpseForMonster(damagedMonster);
    const corpsePayload: CorpseCreatedEvent = {
      corpse
    };

    this.server.emit(worldEventNames.corpseCreated, corpsePayload);
    this.scheduleCorpseDecay(corpse.id, Math.max(0, Date.parse(corpse.decayAt) - Date.now()));

    try {
      const result = await this.charactersService.addExperienceForUserCharacter(
        user.id,
        activePlayer.characterId,
        damagedMonster.experienceReward,
        stance
      );
      const updatedCharacter = result.character;

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
      await this.emitCharacterState(client, user.id, activePlayer.characterId, updatedCharacter);

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

      if (isProtectionZone(this.localMap, candidate)) {
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

  private getRetreatMonsterPosition(monster: Position & { id: string }, target: Position): Position | null {
    const deltaX = target.x - monster.x;
    const deltaY = target.y - monster.y;
    const horizontalStep = deltaX === 0 ? null : { ...monster, x: monster.x - Math.sign(deltaX) };
    const verticalStep = deltaY === 0 ? null : { ...monster, y: monster.y - Math.sign(deltaY) };
    const candidates =
      Math.abs(deltaX) >= Math.abs(deltaY)
        ? [horizontalStep, verticalStep]
        : [verticalStep, horizontalStep];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      if (!isWalkableTile(this.localMap, candidate)) {
        continue;
      }

      if (isProtectionZone(this.localMap, candidate)) {
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

  private async performMonsterPursuitTick(): Promise<void> {
    const players = this.worldStateService.listPlayers();

    if (players.length === 0) {
      return;
    }

    for (const monster of this.worldStateService.listMonsters()) {
      if (!monster.alive) {
        continue;
      }

      const target = this.findNearestPlayerInPursuitRange(
        monster,
        players.filter((player) => !isProtectionZone(this.localMap, player))
      );

      if (!target) {
        continue;
      }

      const isRetreating = monster.retreatAtHealth !== null && monster.health <= monster.retreatAtHealth;

      if (this.isAdjacent(monster, target) && !isRetreating) {
        await this.performMonsterAttack(monster, target.characterId);
        continue;
      }

      const nextPosition = isRetreating
        ? this.getRetreatMonsterPosition(monster, target)
        : this.getNextMonsterPosition(monster, target);

      if (!nextPosition) {
        if (this.isAdjacent(monster, target)) {
          await this.performMonsterAttack(monster, target.characterId);
        }
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

    this.performPlayerFollowTick();
  }

  private performPlayerFollowTick(): void {
    for (const [socketId, session] of this.combatSessions) {
      if (this.playerChaseModeBySocketId.get(socketId) !== "follow") {
        continue;
      }

      const player = this.worldStateService.getPlayerBySocketId(socketId);
      const monster = this.worldStateService.getMonster(session.monsterId);

      if (!player || !monster?.alive || this.isAdjacent(player.position, monster)) {
        continue;
      }

      if (isProtectionZone(this.localMap, player.position) || isProtectionZone(this.localMap, monster)) {
        const client = this.server.sockets.sockets.get(socketId) as WorldSocket | undefined;
        if (client) this.stopCombatSession(client, "target_lost");
        continue;
      }

      const now = Date.now();
      if (now < (this.nextPlayerMoveAtBySocketId.get(socketId) ?? 0)) {
        continue;
      }

      const nextPosition = this.getNextFollowerPosition(player.position, monster);
      if (!nextPosition) {
        continue;
      }

      this.nextPlayerMoveAtBySocketId.set(socketId, now + getMovementCooldownMs(player.level));
      const movedPlayer = this.worldStateService.updatePlayerPosition(socketId, nextPosition);
      if (movedPlayer) {
        this.server.emit(worldEventNames.playerMoved, {
          player: this.worldStateService.toWorldPlayer(movedPlayer)
        });
      }
    }
  }

  private getNextFollowerPosition(player: Position, target: Position): Position | null {
    const deltaX = target.x - player.x;
    const deltaY = target.y - player.y;
    const candidates: Position[] = [];

    if (Math.abs(deltaX) >= Math.abs(deltaY)) {
      if (deltaX !== 0) candidates.push({ ...player, x: player.x + Math.sign(deltaX) });
      if (deltaY !== 0) candidates.push({ ...player, y: player.y + Math.sign(deltaY) });
    } else {
      if (deltaY !== 0) candidates.push({ ...player, y: player.y + Math.sign(deltaY) });
      if (deltaX !== 0) candidates.push({ ...player, x: player.x + Math.sign(deltaX) });
    }

    return (
      candidates.find(
        (candidate) =>
          !this.isSamePosition(candidate, target) &&
          isWalkableTile(this.localMap, candidate) &&
          !isProtectionZone(this.localMap, candidate) &&
          !this.worldStateService.isAliveMonsterAt(candidate) &&
          !this.worldStateService.isPlayerAt(candidate)
      ) ?? null
    );
  }

  private async performMonsterAttack(monster: Position & { id: string; armor: number; maxDamage: number }, characterId: string): Promise<void> {
    const activePlayer = this.worldStateService.getPlayerByCharacterId(characterId);

    if (!activePlayer) {
      return;
    }

    if (isProtectionZone(this.localMap, activePlayer.position)) {
      return;
    }

    const client = this.server.sockets.sockets.get(activePlayer.socketId) as WorldSocket | undefined;

    if (!client) {
      return;
    }

    const now = Date.now();
    const nextAttackAt = this.nextMonsterAttackAtByMonsterId.get(monster.id) ?? 0;

    if (now < nextAttackAt) {
      return;
    }

    this.nextMonsterAttackAtByMonsterId.set(monster.id, now + MONSTER_ATTACK_INTERVAL_MS);

    const stance = this.getCombatStance(activePlayer.socketId);
    const character = await this.charactersService.findByIdForUser(activePlayer.userId, activePlayer.characterId, stance);
    const rawDamage = this.rollDamage(1, monster.maxDamage);
    const defenseReduction = this.rollDefenseReduction(character.combatStats.defenseValue);
    const damageAfterDefense = Math.max(0, rawDamage - defenseReduction);
    const armorReduction = this.rollArmorReduction(character.combatStats.armorValue, damageAfterDefense);
    const damage = Math.max(0, damageAfterDefense - armorReduction);
    let updatedCharacter: CharacterSummary | null = null;

    if (character.combatStats.defenseSkill === "shielding") {
      updatedCharacter = await this.charactersService.addSkillProgressForUserCharacter(
        activePlayer.userId,
        activePlayer.characterId,
        "shielding",
        1,
        stance
      );
    }

    if (damage <= 0) {
      if (updatedCharacter) {
        await this.emitCharacterState(client, activePlayer.userId, activePlayer.characterId, updatedCharacter);
      }
      return;
    }

    updatedCharacter = await this.charactersService.applyDamageToUserCharacter(
      activePlayer.userId,
      activePlayer.characterId,
      damage,
      stance
    );

    client.emit(worldEventNames.characterDamaged, {
      characterId: updatedCharacter.id,
      damage,
      health: updatedCharacter.health,
      maxHealth: updatedCharacter.maxHealth
    } satisfies CharacterDamagedEvent);
    await this.emitCharacterState(client, activePlayer.userId, activePlayer.characterId, updatedCharacter);
  }

  private async performPlayerRegenerationTick(): Promise<void> {
    const now = Date.now();

    for (const socket of this.server.sockets.sockets.values()) {
      const client = socket as WorldSocket;
      const activePlayer = this.worldStateService.getPlayerBySocketId(client.id);
      const foodExpiresAt = this.playerFoodExpiresAtBySocketId.get(client.id) ?? 0;

      if (!activePlayer || foodExpiresAt <= now) {
        this.playerFoodExpiresAtBySocketId.delete(client.id);
        this.playerHealthRegenCarryBySocketId.delete(client.id);
        this.playerManaRegenCarryBySocketId.delete(client.id);
        continue;
      }

      const regeneration = getRegenerationPerSecond(activePlayer.characterClass);
      const nextHealthCarry =
        activePlayer.health < activePlayer.maxHealth
          ? (this.playerHealthRegenCarryBySocketId.get(client.id) ?? 0) + regeneration.health
          : 0;
      const nextManaCarry =
        activePlayer.mana < activePlayer.maxMana
          ? (this.playerManaRegenCarryBySocketId.get(client.id) ?? 0) + regeneration.mana
          : 0;
      const healthGain = Math.floor(nextHealthCarry);
      const manaGain = Math.floor(nextManaCarry);

      this.playerHealthRegenCarryBySocketId.set(client.id, nextHealthCarry - healthGain);
      this.playerManaRegenCarryBySocketId.set(client.id, nextManaCarry - manaGain);

      if (healthGain <= 0 && manaGain <= 0) {
        continue;
      }

      const updatedCharacter = await this.charactersService.regenerateUserCharacter(
        activePlayer.userId,
        activePlayer.characterId,
        {
          health: healthGain,
          mana: manaGain
        },
        this.getCombatStance(client.id)
      );

      await this.emitCharacterState(client, activePlayer.userId, activePlayer.characterId, updatedCharacter);
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

  private scheduleCorpseDecay(corpseId: string, delayMs: number): void {
    const existingTimer = this.corpseDecayTimers.get(corpseId);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.corpseDecayTimers.delete(corpseId);
      const removedCorpse = this.worldStateService.removeCorpse(corpseId);

      if (!removedCorpse) {
        return;
      }

      const payload: CorpseRemovedEvent = {
        corpseId
      };

      this.server.emit(worldEventNames.corpseRemoved, payload);
    }, delayMs);

    this.corpseDecayTimers.set(corpseId, timer);
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

  private emitInventoryError(client: WorldSocket, message: string, code?: string): void {
    const payload: InventoryErrorEvent = { message, code };
    client.emit(worldEventNames.inventoryError, payload);
  }

  private emitEquipmentError(client: WorldSocket, message: string, code?: string): void {
    const payload: EquipmentErrorEvent = { message, code };
    client.emit(worldEventNames.equipmentError, payload);
  }

  private emitContainerError(client: WorldSocket, message: string, code?: string): void {
    const payload: ContainerErrorEvent = { message, code };
    client.emit(worldEventNames.containerError, payload);
  }

  private emitGroundItemError(client: WorldSocket, message: string, code?: string): void {
    const payload: GroundItemErrorEvent = { message, code };
    client.emit(worldEventNames.groundItemError, payload);
  }

  private emitCorpseError(client: WorldSocket, message: string, code?: string): void {
    const payload: CorpseErrorEvent = { message, code };
    client.emit(worldEventNames.corpseError, payload);
  }

  private async emitInventoryState(
    client: WorldSocket,
    userId: string,
    characterId: string,
    message?: string,
    character?: CharacterSummary
  ): Promise<void> {
    client.emit(worldEventNames.inventoryUpdated, {
      items: await this.charactersService.listInventoryForUserCharacter(userId, characterId),
      message
    });
    client.emit(worldEventNames.equipmentUpdated, {
      slots: await this.charactersService.listEquipmentForUserCharacter(userId, characterId),
      message
    });

    await this.emitOpenedContainerStates(client, userId, characterId, message);
    await this.emitCharacterState(client, userId, characterId, character);
  }

  private async emitCharacterState(
    client: WorldSocket,
    userId: string,
    characterId: string,
    character?: CharacterSummary
  ): Promise<CharacterSummary> {
    const nextCharacter = character ?? (await this.charactersService.findByIdForUser(userId, characterId, this.getCombatStance(client.id)));
    this.syncWorldPlayerState(client.id, nextCharacter);
    this.playerFoodExpiresAtBySocketId.set(client.id, nextCharacter.food.foodExpiresAt ? Date.parse(nextCharacter.food.foodExpiresAt) : 0);

    client.emit(worldEventNames.characterUpdated, {
      character: nextCharacter
    } satisfies CharacterUpdatedEvent);
    client.emit(worldEventNames.characterStatsUpdated, {
      characterId: nextCharacter.id,
      health: nextCharacter.health,
      maxHealth: nextCharacter.maxHealth,
      mana: nextCharacter.mana,
      maxMana: nextCharacter.maxMana
    });

    return nextCharacter;
  }

  private syncWorldPlayerState(socketId: string, character: CharacterSummary): void {
    const updatedWorldPlayer = this.worldStateService.updatePlayerStats(socketId, {
      level: character.level,
      health: character.health,
      maxHealth: character.maxHealth,
      mana: character.mana,
      maxMana: character.maxMana
    });

    if (updatedWorldPlayer) {
      this.server.emit(worldEventNames.playerMoved, {
        player: this.worldStateService.toWorldPlayer(updatedWorldPlayer)
      });
    }
  }

  private getCombatStance(socketId: string): CombatStance {
    return this.playerCombatStanceBySocketId.get(socketId) ?? "balanced";
  }

  private async emitOpenedContainerStates(
    client: WorldSocket,
    userId: string,
    characterId: string,
    message?: string
  ): Promise<void> {
    const openedContainerIds = this.openedContainerIdsBySocketId.get(client.id);

    if (!openedContainerIds || openedContainerIds.size === 0) {
      return;
    }

    for (const containerItemId of Array.from(openedContainerIds)) {
      try {
        const containerState = await this.charactersService.openContainerForUserCharacter(userId, characterId, containerItemId);
        client.emit(worldEventNames.containerUpdated, {
          ...containerState,
          message
        });
      } catch {
        openedContainerIds.delete(containerItemId);
      }
    }
  }

  private getOpenedContainerIds(socketId: string): Set<string> {
    const existingContainerIds = this.openedContainerIdsBySocketId.get(socketId);

    if (existingContainerIds) {
      return existingContainerIds;
    }

    const containerIds = new Set<string>();
    this.openedContainerIdsBySocketId.set(socketId, containerIds);
    return containerIds;
  }

  private getCorpseItemLockKey(corpseId: string, corpseItemId: string): string {
    return `${corpseId}:${corpseItemId}`;
  }

  private tryLockCorpse(corpseId: string): boolean {
    if (this.lockedCorpseIds.has(corpseId)) {
      return false;
    }

    this.lockedCorpseIds.add(corpseId);
    return true;
  }

  private releaseCorpseLock(corpseId: string): void {
    this.lockedCorpseIds.delete(corpseId);
  }

  private tryLockCorpseItem(corpseItemLockKey: string): boolean {
    if (this.lockedCorpseItemKeys.has(corpseItemLockKey)) {
      return false;
    }

    this.lockedCorpseItemKeys.add(corpseItemLockKey);
    return true;
  }

  private releaseCorpseItemLock(corpseItemLockKey: string): void {
    this.lockedCorpseItemKeys.delete(corpseItemLockKey);
  }

  private tryLockGroundItem(groundItemId: string): boolean {
    if (this.lockedGroundItemIds.has(groundItemId)) {
      return false;
    }

    this.lockedGroundItemIds.add(groundItemId);
    return true;
  }

  private releaseGroundItemLock(groundItemId: string): void {
    this.lockedGroundItemIds.delete(groundItemId);
  }

  private emitInventoryOperationError(client: WorldSocket, error: unknown): void {
    if (error instanceof InventoryFullError) {
      this.emitInventoryError(client, "Your inventory is full.", "inventory_full");
      return;
    }

    if (error instanceof InventoryValidationError) {
      this.emitInventoryError(client, error.message, error.code);
      return;
    }

    this.logger.warn(`Inventory operation failed for socket ${client.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    this.emitInventoryError(client, "The inventory action could not be completed.", "inventory_action_failed");
  }

  private emitEquipmentOperationError(client: WorldSocket, error: unknown): void {
    if (error instanceof InventoryFullError) {
      this.emitEquipmentError(client, "Your inventory is full.", "inventory_full");
      return;
    }

    if (error instanceof InventoryValidationError) {
      this.emitEquipmentError(client, error.message, error.code);
      return;
    }

    this.logger.warn(`Equipment operation failed for socket ${client.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    this.emitEquipmentError(client, "The equipment action could not be completed.", "equipment_action_failed");
  }

  private emitContainerOperationError(client: WorldSocket, error: unknown): void {
    if (error instanceof InventoryFullError) {
      this.emitContainerError(client, "That container is full.", "container_full");
      return;
    }

    if (error instanceof InventoryValidationError) {
      this.emitContainerError(client, error.message, error.code);
      return;
    }

    this.logger.warn(`Container operation failed for socket ${client.id}: ${error instanceof Error ? error.message : "unknown error"}`);
    this.emitContainerError(client, "The container action could not be completed.", "container_action_failed");
  }

  private normalizeDropPosition(position: Partial<Position> | undefined): Position | null {
    if (!position) {
      return null;
    }

    const x = Number(position.x);
    const y = Number(position.y);
    const z = Number(position.z);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }

    return {
      x: Math.round(x),
      y: Math.round(y),
      z: Math.round(z)
    };
  }

  private isAdjacent(attacker: Position, target: Position): boolean {
    return attacker.z === target.z && Math.max(Math.abs(attacker.x - target.x), Math.abs(attacker.y - target.y)) === 1;
  }

  private isInDirectContact(player: Position, target: Position): boolean {
    return player.z === target.z && Math.max(Math.abs(player.x - target.x), Math.abs(player.y - target.y)) <= 1;
  }

  private isWithinItemThrowRange(player: Position, target: Position): boolean {
    return player.z === target.z && Math.max(Math.abs(player.x - target.x), Math.abs(player.y - target.y)) <= ITEM_THROW_RANGE;
  }

  private isWithinCorpseMoveRange(player: Position, target: Position): boolean {
    const distance = Math.max(Math.abs(player.x - target.x), Math.abs(player.y - target.y));
    return player.z === target.z && distance > 0 && distance <= CORPSE_MOVE_RANGE;
  }

  private hasLineOfSight(origin: Position, target: Position): boolean {
    if (origin.z !== target.z) {
      return false;
    }

    const deltaX = Math.abs(target.x - origin.x);
    const deltaY = Math.abs(target.y - origin.y);
    const stepX = origin.x < target.x ? 1 : -1;
    const stepY = origin.y < target.y ? 1 : -1;
    let error = deltaX - deltaY;
    let x = origin.x;
    let y = origin.y;

    while (!(x === target.x && y === target.y)) {
      const doubleError = error * 2;

      if (doubleError > -deltaY) {
        error -= deltaY;
        x += stepX;
      }

      if (doubleError < deltaX) {
        error += deltaX;
        y += stepY;
      }

      if (x === target.x && y === target.y) {
        return true;
      }

      if (getTileType(this.localMap, x, y) === "wall") {
        return false;
      }
    }

    return true;
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
    if (maximum <= minimum) {
      return Math.max(0, Math.floor(minimum));
    }

    return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
  }

  private rollDefenseReduction(defenseValue: number): number {
    if (defenseValue <= 0) {
      return 0;
    }

    return this.rollDamage(0, Math.max(0, defenseValue));
  }

  private rollArmorReduction(totalArmor: number, damageAfterDefense: number): number {
    if (totalArmor <= 0 || damageAfterDefense <= 0) {
      return 0;
    }

    const minimumReduction = Math.max(0, Math.floor(totalArmor / 2));
    const maximumReduction = Math.max(minimumReduction, minimumReduction * 2 - 1);
    return Math.min(damageAfterDefense, this.rollDamage(minimumReduction, maximumReduction));
  }
}
