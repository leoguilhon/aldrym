import type {
  CharacterSummary,
  CombatErrorEvent,
  ContainerErrorEvent,
  ContainerState,
  Corpse,
  CorpseErrorEvent,
  CorpseItem,
  EquipmentErrorEvent,
  EquipmentSlot,
  EquipmentSlotState,
  GroundItem,
  GroundItemErrorEvent,
  InventoryErrorEvent,
  InventoryItem,
  InventoryMoveTarget,
  InventorySlot,
  MoveDirection,
  Position,
  WorldClientToServerEvents,
  WorldErrorEvent,
  WorldMonster,
  WorldPlayer,
  WorldServerToClientEvents
} from "@aldrym/shared";
import { createLocalMap, equipmentSlots, resolveLocalPlayerSpawn, worldEventNames } from "@aldrym/shared";
import { useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";

import { useAuth } from "../auth/auth-context";
import { StatusView } from "../components/status-view";
import { fetchCharacter, getApiBaseUrl } from "../lib/api";
import { getErrorMessage } from "../lib/api-error";

type WorldConnectionState = "connecting" | "connected" | "joined" | "disconnected" | "error";

const localMap = createLocalMap();
const playerScreenTileHalfHeight = 5;
const playerScreenTileHalfWidth = 7;
const containerWindowDefaultWidthPx = 224;
const containerWindowDefaultHeightPx = 214;
const containerWindowGapPx = 8;
const containerWorkspaceMinimumHeightPx = 560;
const corpseLootSlotCount = 4;

type DragItemLocation =
  | { locationType: "root"; slotIndex: number }
  | { locationType: "container"; containerItemId: string; slotIndex: number }
  | { locationType: "equipment"; equipmentSlot: EquipmentSlot }
  | { locationType: "ground"; groundItemId: string }
  | { locationType: "corpse"; corpseId: string; corpseItemId: string };

interface DragItemPayload {
  corpseId?: string;
  corpseItemId?: string;
  itemId?: string;
  groundItemId?: string;
  quantity?: number;
  location: DragItemLocation;
}

interface ContainerWindowPosition {
  x: number;
  y: number;
}

interface GroundDragPreview {
  clientX: number;
  clientY: number;
  itemKey: string;
}

type ContainerWindowDescriptor =
  | { id: string; type: "container"; container: ContainerState }
  | { id: string; type: "corpse"; corpse: Corpse }
  | { id: string; type: "loot-error" };

function getContainerWindowDefaultPosition(index: number, workspaceWidth: number): ContainerWindowPosition {
  const availableWidth = workspaceWidth > 0 ? workspaceWidth : containerWindowDefaultWidthPx * 3 + containerWindowGapPx * 2;
  const windowsPerRow = Math.max(
    1,
    Math.floor((availableWidth + containerWindowGapPx) / (containerWindowDefaultWidthPx + containerWindowGapPx))
  );
  const column = index % windowsPerRow;
  const row = Math.floor(index / windowsPerRow);

  return {
    x: column * (containerWindowDefaultWidthPx + containerWindowGapPx),
    y: row * (containerWindowDefaultHeightPx + containerWindowGapPx)
  };
}

function doContainerWindowPositionsOverlap(left: ContainerWindowPosition, right: ContainerWindowPosition): boolean {
  return (
    left.x < right.x + containerWindowDefaultWidthPx + containerWindowGapPx &&
    left.x + containerWindowDefaultWidthPx + containerWindowGapPx > right.x &&
    left.y < right.y + containerWindowDefaultHeightPx + containerWindowGapPx &&
    left.y + containerWindowDefaultHeightPx + containerWindowGapPx > right.y
  );
}

function getFirstAvailableContainerWindowPosition(
  occupiedPositions: ContainerWindowPosition[],
  workspaceWidth: number
): ContainerWindowPosition {
  for (let index = 0; index < 100; index += 1) {
    const candidatePosition = getContainerWindowDefaultPosition(index, workspaceWidth);

    if (!occupiedPositions.some((position) => doContainerWindowPositionsOverlap(candidatePosition, position))) {
      return candidatePosition;
    }
  }

  return getContainerWindowDefaultPosition(occupiedPositions.length, workspaceWidth);
}

function getContainerWorkspaceHeight(windowCount: number, workspaceWidth: number): number {
  if (windowCount === 0) {
    return 0;
  }

  const availableWidth = workspaceWidth > 0 ? workspaceWidth : containerWindowDefaultWidthPx * 3 + containerWindowGapPx * 2;
  const windowsPerRow = Math.max(
    1,
    Math.floor((availableWidth + containerWindowGapPx) / (containerWindowDefaultWidthPx + containerWindowGapPx))
  );
  const rowCount = Math.ceil(windowCount / windowsPerRow);

  return Math.max(containerWorkspaceMinimumHeightPx, rowCount * containerWindowDefaultHeightPx + (rowCount - 1) * containerWindowGapPx);
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function setItemDragImage(event: DragEvent<HTMLElement>): void {
  const image = event.currentTarget.querySelector(".item-icon img") as HTMLImageElement | null;

  if (!image) {
    return;
  }

  const rect = image.getBoundingClientRect();
  event.dataTransfer.setDragImage(image, rect.width / 2, rect.height / 2);
}

function upsertWorldPlayer(players: WorldPlayer[], nextPlayer: WorldPlayer): WorldPlayer[] {
  const existingIndex = players.findIndex((player) => player.characterId === nextPlayer.characterId);

  if (existingIndex === -1) {
    return [...players, nextPlayer];
  }

  return players.map((player) => (player.characterId === nextPlayer.characterId ? nextPlayer : player));
}

function removeWorldPlayer(players: WorldPlayer[], characterId: string): WorldPlayer[] {
  return players.filter((player) => player.characterId !== characterId);
}

function upsertWorldMonster(monsters: WorldMonster[], nextMonster: WorldMonster): WorldMonster[] {
  const existingIndex = monsters.findIndex((monster) => monster.id === nextMonster.id);

  if (existingIndex === -1) {
    return [...monsters, nextMonster];
  }

  return monsters.map((monster) => (monster.id === nextMonster.id ? nextMonster : monster));
}

function updateWorldMonster(
  monsters: WorldMonster[],
  monsterId: string,
  updates: Partial<Pick<WorldMonster, "alive" | "health" | "maxHealth">>
): WorldMonster[] {
  return monsters.map((monster) => (monster.id === monsterId ? { ...monster, ...updates } : monster));
}

function upsertCorpse(corpses: Corpse[], nextCorpse: Corpse): Corpse[] {
  const existingIndex = corpses.findIndex((corpse) => corpse.id === nextCorpse.id);

  if (existingIndex === -1) {
    return [...corpses, nextCorpse];
  }

  return corpses.map((corpse) => (corpse.id === nextCorpse.id ? nextCorpse : corpse));
}

function upsertOpenedCorpse(corpses: Corpse[], nextCorpse: Corpse): Corpse[] {
  const existingIndex = corpses.findIndex((corpse) => corpse.id === nextCorpse.id);

  if (existingIndex === -1) {
    return [...corpses, nextCorpse];
  }

  return corpses.map((corpse) => (corpse.id === nextCorpse.id ? nextCorpse : corpse));
}

function removeCorpse(corpses: Corpse[], corpseId: string): Corpse[] {
  return corpses.filter((corpse) => corpse.id !== corpseId);
}

function getCorpseErrorMessage(payload: CorpseErrorEvent): string {
  if (payload.code === "corpse_too_far") {
    return "Stand on the corpse tile or on any adjacent tile, including diagonals.";
  }

  return payload.message;
}

function isInCorpseInteractionRange(position: Position, corpse: Corpse): boolean {
  if (position.z !== corpse.z) {
    return false;
  }

  const deltaX = Math.abs(position.x - corpse.x);
  const deltaY = Math.abs(position.y - corpse.y);

  return Math.max(deltaX, deltaY) <= 1;
}

function findNearestVisibleMonster(position: Position | null, monsters: WorldMonster[]): WorldMonster | null {
  if (!position) {
    return null;
  }

  let nearestMonster: WorldMonster | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const monster of monsters) {
    if (!monster.alive || monster.z !== position.z) {
      continue;
    }

    const deltaX = Math.abs(monster.x - position.x);
    const deltaY = Math.abs(monster.y - position.y);

    if (deltaX > playerScreenTileHalfWidth || deltaY > playerScreenTileHalfHeight) {
      continue;
    }

    const distance = deltaX + deltaY;

    if (distance >= nearestDistance) {
      continue;
    }

    nearestMonster = monster;
    nearestDistance = distance;
  }

  return nearestMonster;
}

function getConnectionLabel(state: WorldConnectionState): string {
  switch (state) {
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "joined":
      return "Joined";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Connection Error";
    default:
      return "Unknown";
  }
}

function getConnectionCopy(state: WorldConnectionState): string {
  switch (state) {
    case "connecting":
      return "Opening a Socket.IO connection to the world server.";
    case "connected":
      return "Socket connection is open. Waiting for world join.";
    case "joined":
      return "World connection is active.";
    case "disconnected":
      return "The world server connection was closed.";
    case "error":
      return "The client could not join the multiplayer world.";
    default:
      return "World state is unavailable.";
  }
}

function PositionLabel({ position }: { position: Position | null }) {
  if (!position) {
    return <span>Calculating...</span>;
  }

  return (
    <span>
      {position.x}, {position.y}, {position.z}
    </span>
  );
}

function Meter({
  current,
  label,
  maximum,
  tone
}: {
  current: number;
  label: string;
  maximum: number;
  tone: "health" | "mana";
}) {
  const width = maximum > 0 ? Math.max(0, Math.min(100, (current / maximum) * 100)) : 0;

  return (
    <div className="meter-block">
      <div className="meter-block__header">
        <span>{label}</span>
        <strong>
          {current} / {maximum}
        </strong>
      </div>
      <div className={`meter-block__track meter-block__track--${tone}`}>
        <span style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function GameViewport({
  activeCombatMonsterId,
  corpses,
  groundItems,
  localCharacterId,
  monsters,
  noticeMessage,
  onAttackMonster,
  onDropCorpseItemToGround,
  onDropItemToGround,
  onMoveCorpse,
  onMoveGroundItem,
  onMoveIntent,
  onOpenCorpse,
  onShowNotice,
  onTakeGroundItem,
  onTakeGroundItemToTarget,
  players
}: {
  activeCombatMonsterId: string | null;
  corpses: Corpse[];
  groundItems: GroundItem[];
  localCharacterId: string;
  monsters: WorldMonster[];
  noticeMessage: string | null;
  onAttackMonster: (monsterId: string) => void;
  onDropCorpseItemToGround: (corpseId: string, corpseItemId: string, quantity: number, position: Position) => void;
  onDropItemToGround: (itemId: string, position: Position) => void;
  onMoveCorpse: (corpseId: string, position: Position) => void;
  onMoveGroundItem: (groundItemId: string, position: Position) => void;
  onMoveIntent: (direction: MoveDirection) => void;
  onOpenCorpse: (corpseId: string) => void;
  onShowNotice: (message: string) => void;
  onTakeGroundItem: (groundItemId: string) => void;
  onTakeGroundItemToTarget: (
    groundItemId: string,
    target: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>
  ) => void;
  players: WorldPlayer[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<{
    destroy: () => void;
    getTilePositionFromClientPoint: (clientX: number, clientY: number) => Position | null;
    setActiveCombatMonsterId: (monsterId: string | null) => void;
    setCorpses: (nextCorpses: Corpse[]) => void;
    setGroundItems: (nextGroundItems: GroundItem[]) => void;
    setMonsters: (nextMonsters: WorldMonster[]) => void;
    setPlayers: (nextPlayers: WorldPlayer[]) => void;
  } | null>(null);
  const activeCombatMonsterIdRef = useRef(activeCombatMonsterId);
  const attackMonsterRef = useRef(onAttackMonster);
  const corpsesRef = useRef(corpses);
  const groundItemsRef = useRef(groundItems);
  const monstersRef = useRef(monsters);
  const moveGroundItemRef = useRef(onMoveGroundItem);
  const moveCorpseRef = useRef(onMoveCorpse);
  const moveIntentRef = useRef(onMoveIntent);
  const openCorpseRef = useRef(onOpenCorpse);
  const playersRef = useRef(players);
  const showNoticeRef = useRef(onShowNotice);
  const takeGroundItemRef = useRef(onTakeGroundItem);
  const takeGroundItemToTargetRef = useRef(onTakeGroundItemToTarget);
  const draggedGroundItemIdRef = useRef<string | null>(null);
  const getDropTileFromEvent = (event: DragEvent<HTMLDivElement>): Position | null =>
    gameRef.current?.getTilePositionFromClientPoint(event.clientX, event.clientY) ?? null;

  useEffect(() => {
    activeCombatMonsterIdRef.current = activeCombatMonsterId;
    gameRef.current?.setActiveCombatMonsterId(activeCombatMonsterId);
  }, [activeCombatMonsterId]);

  useEffect(() => {
    attackMonsterRef.current = onAttackMonster;
  }, [onAttackMonster]);

  useEffect(() => {
    corpsesRef.current = corpses;
    gameRef.current?.setCorpses(corpses);
  }, [corpses]);

  useEffect(() => {
    groundItemsRef.current = groundItems;
    gameRef.current?.setGroundItems(groundItems);
  }, [groundItems]);

  useEffect(() => {
    monstersRef.current = monsters;
    gameRef.current?.setMonsters(monsters);
  }, [monsters]);

  useEffect(() => {
    moveGroundItemRef.current = onMoveGroundItem;
  }, [onMoveGroundItem]);

  useEffect(() => {
    moveCorpseRef.current = onMoveCorpse;
  }, [onMoveCorpse]);

  useEffect(() => {
    moveIntentRef.current = onMoveIntent;
  }, [onMoveIntent]);

  useEffect(() => {
    openCorpseRef.current = onOpenCorpse;
  }, [onOpenCorpse]);

  useEffect(() => {
    showNoticeRef.current = onShowNotice;
  }, [onShowNotice]);

  useEffect(() => {
    takeGroundItemRef.current = onTakeGroundItem;
  }, [onTakeGroundItem]);

  useEffect(() => {
    takeGroundItemToTargetRef.current = onTakeGroundItemToTarget;
  }, [onTakeGroundItemToTarget]);

  useEffect(() => {
    playersRef.current = players;
    gameRef.current?.setPlayers(players);
  }, [players]);

  useEffect(() => {
    const handleGroundItemDragStart = (event: Event) => {
      const detail = (event as CustomEvent<{ groundItemId: string }>).detail;
      draggedGroundItemIdRef.current = detail?.groundItemId ?? null;
    };

    window.addEventListener("aldrym:ground-item-drag-start", handleGroundItemDragStart);

    return () => {
      window.removeEventListener("aldrym:ground-item-drag-start", handleGroundItemDragStart);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const mountElement = container;
    let isCancelled = false;

    async function mountGame() {
      const { AldrymGame } = await import("../game/AldrymGame");

      if (isCancelled) {
        return;
      }

      const game = new AldrymGame({
        activeCombatMonsterId: activeCombatMonsterIdRef.current,
        corpses: corpsesRef.current,
        groundItems: groundItemsRef.current,
        localCharacterId,
        monsters: monstersRef.current,
        onAttackMonster: (monsterId) => attackMonsterRef.current(monsterId),
        onMoveCorpse: (corpseId, position) => moveCorpseRef.current(corpseId, position),
        onMoveGroundItem: (groundItemId, position) => moveGroundItemRef.current(groundItemId, position),
        onMoveIntent: (direction) => moveIntentRef.current(direction),
        onOpenCorpse: (corpseId) => openCorpseRef.current(corpseId),
        onShowNotice: (message) => showNoticeRef.current(message),
        onTakeGroundItem: (groundItemId) => takeGroundItemRef.current(groundItemId),
        onTakeGroundItemToTarget: (groundItemId, target) => takeGroundItemToTargetRef.current(groundItemId, target),
        parent: mountElement,
        players: playersRef.current
      });

      gameRef.current = game;
      game.setActiveCombatMonsterId(activeCombatMonsterIdRef.current);
      game.setCorpses(corpsesRef.current);
      game.setGroundItems(groundItemsRef.current);
      game.setMonsters(monstersRef.current);
      game.setPlayers(playersRef.current);
    }

    void mountGame();

    return () => {
      isCancelled = true;
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, [localCharacterId]);

  return (
    <div
      className="game-client__viewport-mount"
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const payload = readDragPayload(event);

        const dropPosition = getDropTileFromEvent(event);
        const draggedGroundItemId = draggedGroundItemIdRef.current;
        draggedGroundItemIdRef.current = null;

        if ((!payload && !draggedGroundItemId) || !dropPosition) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (payload?.itemId) {
          onDropItemToGround(payload.itemId, dropPosition);
          return;
        }

        if (payload?.corpseId && payload.corpseItemId) {
          onDropCorpseItemToGround(payload.corpseId, payload.corpseItemId, payload.quantity ?? 1, dropPosition);
          return;
        }

        const groundItemId = payload?.groundItemId ?? draggedGroundItemId;

        if (groundItemId) {
          onMoveGroundItem(groundItemId, dropPosition);
        }
      }}
      ref={containerRef}
    >
      {noticeMessage ? <p className="game-client__viewport-notice">{noticeMessage}</p> : null}
    </div>
  );
}

function LootWindow({
  corpse,
  errorMessage,
  onClose,
  onDropItemToCorpse,
  onTakeItem,
  onWindowDragStart
}: {
  corpse: Corpse | null;
  errorMessage: string | null;
  onClose: () => void;
  onDropItemToCorpse: (corpseId: string, itemId: string) => void;
  onTakeItem: (corpseId: string, corpseItemId: string, quantity: number) => void;
  onWindowDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  if (!corpse && !errorMessage) {
    return null;
  }

  const lootSlots = Array.from({ length: corpseLootSlotCount }, (_, slotIndex) => corpse?.items[slotIndex] ?? null);

  return (
    <section
      className="loot-window"
      onDragOver={(event) => {
        if (!corpse) {
          return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        const payload = readDragPayload(event);

        if (!corpse || !payload?.itemId) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        onDropItemToCorpse(corpse.id, payload.itemId);
      }}
    >
      <div className="loot-window__header loot-window__header--draggable" onPointerDown={onWindowDragStart}>
        <strong>{corpse ? `${corpse.monsterName} Corpse` : "Loot"}</strong>
        <button
          className="loot-window__close"
          onClick={onClose}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          x
        </button>
      </div>

      {errorMessage ? <p className="form-message form-message--error">{errorMessage}</p> : null}

      {corpse ? (
        <ul className="loot-list">
          {lootSlots.map((item, slotIndex) => (
            item ? (
              <li
                className="loot-list__item"
                draggable
                key={item.corpseItemId}
                title={getItemTooltip(item)}
                onDragStart={(event) => {
                  const payload = createCorpseDragPayload(corpse.id, item, event.shiftKey ? 1 : item.quantity);
                  setItemDragImage(event);
                  window.dispatchEvent(new CustomEvent("aldrym:item-drag-start"));
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-aldrym-item", payload);
                  event.dataTransfer.setData("text/plain", payload);
                }}
              >
                <button
                  aria-label={`Take ${item.name}`}
                  className="loot-list__item-button"
                  onClick={() => onTakeItem(corpse.id, item.corpseItemId, item.quantity)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onTakeItem(corpse.id, item.corpseItemId, event.shiftKey ? 1 : item.quantity);
                  }}
                  type="button"
                  title={getItemTooltip(item)}
                >
                  <ItemIcon item={item} />
                </button>
              </li>
            ) : (
              <li
                aria-label="Empty loot slot"
                className="loot-list__item loot-list__item--empty"
                key={`empty-loot-${slotIndex}`}
              />
            )
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function formatEquipmentSlot(slot: EquipmentSlot): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

function getItemIconPath(itemKey: string): string {
  switch (itemKey) {
    case "brown_backpack":
      return "/assets/items/brown_backpack.png";
    case "chipped_dagger":
      return "/assets/items/chipped_dagger.png";
    case "gold_coin":
      return "/assets/items/gold_coin.png";
    default:
      return "/assets/items/gold_coin.png";
  }
}

function getItemTooltip(item: Pick<InventoryItem | CorpseItem, "itemKey" | "itemType" | "name" | "quantity" | "stackable">): string {
  return `${item.name}${item.stackable || item.quantity > 1 ? ` x${item.quantity}` : ""}\nType: ${item.itemType}`;
}

function ItemIcon({ item }: { item: Pick<InventoryItem | CorpseItem, "itemKey" | "name" | "quantity" | "stackable"> }) {
  return (
    <span className="item-icon" aria-hidden="true">
      <img alt="" draggable={false} src={getItemIconPath(item.itemKey)} />
      {item.stackable || item.quantity > 1 ? <strong>{item.quantity}</strong> : null}
    </span>
  );
}

function createDragPayload(item: InventoryItem, location: DragItemLocation): string {
  return JSON.stringify({
    itemId: item.id,
    location
  } satisfies DragItemPayload);
}

function createCorpseDragPayload(corpseId: string, item: CorpseItem, quantity: number): string {
  return JSON.stringify({
    corpseId,
    corpseItemId: item.corpseItemId,
    quantity,
    location: {
      locationType: "corpse",
      corpseId,
      corpseItemId: item.corpseItemId
    }
  } satisfies DragItemPayload);
}

function readDragPayload(event: DragEvent): DragItemPayload | null {
  const rawPayload = event.dataTransfer.getData("application/x-aldrym-item") || event.dataTransfer.getData("text/plain");

  if (!rawPayload) {
    return null;
  }

  try {
    const payload = JSON.parse(rawPayload) as DragItemPayload;
    return typeof payload.itemId === "string" || typeof payload.groundItemId === "string" || typeof payload.corpseItemId === "string"
      ? payload
      : null;
  } catch {
    return null;
  }
}

function getItemSlotDropTarget(item: InventoryItem | null, location: DragItemLocation): InventoryMoveTarget | null {
  if (location.locationType === "equipment") {
    if (location.equipmentSlot === "backpack" && item?.isContainer) {
      return {
        locationType: "container",
        containerItemId: item.id
      };
    }

    return {
      locationType: "equipment",
      equipmentSlot: location.equipmentSlot
    };
  }

  if (location.locationType === "container") {
    return {
      locationType: "container",
      containerItemId: location.containerItemId,
      slotIndex: location.slotIndex
    };
  }

  if (location.locationType === "root") {
    return {
      locationType: "root",
      slotIndex: location.slotIndex
    };
  }

  return null;
}

function ItemSlot({
  item,
  label,
  location,
  onDropItem,
  onTakeCorpseItemToTarget,
  onTakeGroundItemToTarget,
  onOpenContainer,
  onQuickEquip
}: {
  item: InventoryItem | null;
  label: string;
  location: DragItemLocation;
  onDropItem: (itemId: string, target: InventoryMoveTarget) => void;
  onTakeCorpseItemToTarget: (
    corpseId: string,
    corpseItemId: string,
    quantity: number,
    target: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>
  ) => void;
  onTakeGroundItemToTarget: (groundItemId: string, target: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>) => void;
  onOpenContainer: (containerItemId: string) => void;
  onQuickEquip: (itemId: string) => void;
}) {
  const [dragState, setDragState] = useState<"none" | "valid" | "invalid">("none");
  const target = getItemSlotDropTarget(item, location);
  const tooltip = item ? getItemTooltip(item) : label;
  const equipmentSlot = location.locationType === "equipment" ? location.equipmentSlot : null;

  return (
    <div
      aria-label={tooltip}
      aria-grabbed={Boolean(item)}
      className={[
        item ? "game-inventory-bar__item" : "game-inventory-bar__item game-inventory-bar__item--empty",
        equipmentSlot ? "game-inventory-bar__item--equipment" : "",
        dragState === "valid" ? "game-inventory-bar__item--valid-target" : "",
        dragState === "invalid" ? "game-inventory-bar__item--invalid-target" : ""
      ].filter(Boolean).join(" ")}
      data-equipment-slot={equipmentSlot ?? undefined}
      data-inventory-drop-target={target && target.locationType !== "root" ? JSON.stringify(target) : undefined}
      draggable={Boolean(item)}
      role="listitem"
      onContextMenu={(event) => {
        if (!item) {
          return;
        }

        event.preventDefault();

        if (item.isContainer) {
          onOpenContainer(item.id);
          return;
        }

        if (item.compatibleEquipmentSlots?.length) {
          onQuickEquip(item.id);
        }
      }}
      onDragStart={(event) => {
        if (!item) {
          event.preventDefault();
          return;
        }

        const payload = createDragPayload(item, location);
        setItemDragImage(event);
        window.dispatchEvent(new CustomEvent("aldrym:item-drag-start"));
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-aldrym-item", payload);
        event.dataTransfer.setData("text/plain", payload);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        setDragState("valid");
      }}
      onDragLeave={() => setDragState("none")}
      onDrop={(event) => {
        const payload = readDragPayload(event);
        event.preventDefault();
        event.stopPropagation();
        setDragState("none");

        if (!payload || !target) {
          return;
        }

        if (payload.corpseId && payload.corpseItemId && target.locationType !== "root") {
          onTakeCorpseItemToTarget(payload.corpseId, payload.corpseItemId, payload.quantity ?? 1, target);
          return;
        }

        if (payload.groundItemId && target.locationType !== "root") {
          onTakeGroundItemToTarget(payload.groundItemId, target);
          return;
        }

        if (payload.itemId) {
          onDropItem(payload.itemId, target);
        }
      }}
      title={tooltip}
    >
      {item ? (
        <ItemIcon item={item} />
      ) : null}
    </div>
  );
}

function EquipmentPanel({
  slots,
  onDropItem,
  onTakeCorpseItemToTarget,
  onTakeGroundItemToTarget,
  onOpenContainer,
  onQuickEquip
}: {
  slots: EquipmentSlotState[];
  onDropItem: (itemId: string, target: InventoryMoveTarget) => void;
  onTakeCorpseItemToTarget: (
    corpseId: string,
    corpseItemId: string,
    quantity: number,
    target: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>
  ) => void;
  onTakeGroundItemToTarget: (groundItemId: string, target: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>) => void;
  onOpenContainer: (containerItemId: string) => void;
  onQuickEquip: (itemId: string) => void;
}) {
  return (
    <div className="equipment-paperdoll" role="list">
      {slots.map((slot) => (
        <div className={`equipment-paperdoll__slot equipment-paperdoll__slot--${slot.slot}`} key={slot.slot}>
          <ItemSlot
            item={slot.item}
            label={formatEquipmentSlot(slot.slot)}
            location={{ locationType: "equipment", equipmentSlot: slot.slot }}
            onDropItem={onDropItem}
            onTakeCorpseItemToTarget={onTakeCorpseItemToTarget}
            onTakeGroundItemToTarget={onTakeGroundItemToTarget}
            onOpenContainer={onOpenContainer}
            onQuickEquip={onQuickEquip}
          />
        </div>
      ))}
    </div>
  );
}

function BackpackWindow({
  container,
  onClose,
  onDropItem,
  onTakeCorpseItemToTarget,
  onTakeGroundItemToTarget,
  onOpenContainer,
  onQuickEquip,
  onWindowDragStart
}: {
  container: ContainerState;
  onClose: (containerItemId: string) => void;
  onDropItem: (itemId: string, target: InventoryMoveTarget) => void;
  onTakeCorpseItemToTarget: (
    corpseId: string,
    corpseItemId: string,
    quantity: number,
    target: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>
  ) => void;
  onTakeGroundItemToTarget: (groundItemId: string, target: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>) => void;
  onOpenContainer: (containerItemId: string) => void;
  onQuickEquip: (itemId: string) => void;
  onWindowDragStart: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const occupiedSlotCount = container.slots.filter((slot) => slot.item).length;

  return (
    <section className="backpack-window">
      <div className="loot-window__header loot-window__header--draggable" onPointerDown={onWindowDragStart}>
        <strong>{container.container.name}</strong>
        <span>
          {occupiedSlotCount} / {container.slots.length}
        </span>
        <button
          className="loot-window__close"
          onClick={() => onClose(container.container.id)}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          x
        </button>
      </div>
      <div className="backpack-window__items" role="list">
        {container.slots.map((slot) => (
          <ItemSlot
            item={slot.item}
            key={slot.item?.id ?? `${container.container.id}-${slot.slotIndex}`}
            label="Empty"
            location={{ locationType: "container", containerItemId: container.container.id, slotIndex: slot.slotIndex }}
            onDropItem={onDropItem}
            onTakeCorpseItemToTarget={onTakeCorpseItemToTarget}
            onTakeGroundItemToTarget={onTakeGroundItemToTarget}
            onOpenContainer={onOpenContainer}
            onQuickEquip={onQuickEquip}
          />
        ))}
      </div>
    </section>
  );
}

export function GamePage() {
  const { characterId } = useParams();
  const { token } = useAuth();
  const draggedGroundItemIdRef = useRef<string | null>(null);
  const containerWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket<WorldServerToClientEvents, WorldClientToServerEvents> | null>(null);
  const [activeCombatMonsterId, setActiveCombatMonsterId] = useState<string | null>(null);
  const [activeContainerWindowId, setActiveContainerWindowId] = useState<string | null>(null);
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [containerWindowPositions, setContainerWindowPositions] = useState<Record<string, ContainerWindowPosition>>({});
  const [containerWorkspaceWidth, setContainerWorkspaceWidth] = useState(0);
  const [connectionState, setConnectionState] = useState<WorldConnectionState>("connecting");
  const [containers, setContainers] = useState<ContainerState[]>([]);
  const [corpses, setCorpses] = useState<Corpse[]>([]);
  const [equipmentItems, setEquipmentItems] = useState<EquipmentSlotState[]>(
    equipmentSlots.map((slot) => ({ slot, item: null }))
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [groundDragPreview, setGroundDragPreview] = useState<GroundDragPreview | null>(null);
  const [groundItems, setGroundItems] = useState<GroundItem[]>([]);
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(true);
  const [lootErrorMessage, setLootErrorMessage] = useState<string | null>(null);
  const [monsters, setMonsters] = useState<WorldMonster[]>([]);
  const [openedCorpses, setOpenedCorpses] = useState<Corpse[]>([]);
  const [players, setPlayers] = useState<WorldPlayer[]>([]);
  const [worldErrorMessage, setWorldErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !characterId) {
      setIsLoadingCharacter(false);
      return;
    }

    const activeToken = token;
    const activeCharacterId = characterId;
    let isCancelled = false;

    async function loadCharacter() {
      setErrorMessage(null);
      setIsLoadingCharacter(true);

      try {
        const selectedCharacter = await fetchCharacter(activeToken, activeCharacterId);

        if (!isCancelled) {
          setCharacter(selectedCharacter);
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingCharacter(false);
        }
      }
    }

    void loadCharacter();

    return () => {
      isCancelled = true;
    };
  }, [characterId, token]);

  const loadedCharacterId = character?.id ?? null;

  useEffect(() => {
    if (!token || !characterId || !loadedCharacterId) {
      return;
    }

    const socket = io(getApiBaseUrl(), {
      auth: { token },
      reconnection: false,
      transports: ["websocket"]
    });

    socketRef.current = socket;
    setActiveCombatMonsterId(null);
    setConnectionState("connecting");
    setContainers([]);
    setCorpses([]);
    setEquipmentItems(equipmentSlots.map((slot) => ({ slot, item: null })));
    setFeedbackMessage(null);
    setGroundItems([]);
    setLootErrorMessage(null);
    setMonsters([]);
    setOpenedCorpses([]);
    setPlayers([]);
    setWorldErrorMessage(null);

    socket.on("connect", () => {
      setConnectionState("connected");
      setWorldErrorMessage(null);
      socket.emit(worldEventNames.worldJoin, { characterId });
    });

    socket.on("connect_error", (error: Error) => {
      setConnectionState("error");
      setWorldErrorMessage(error.message || "Could not connect to the world server.");
    });

    socket.on(worldEventNames.worldJoined, (payload) => {
      setConnectionState("joined");
      setPlayers((currentPlayers) => upsertWorldPlayer(currentPlayers, payload.player));
    });

    socket.on(worldEventNames.worldPlayers, (payload) => {
      setPlayers(payload.players);
    });

    socket.on(worldEventNames.worldMonsters, (payload) => {
      setMonsters(payload.monsters);
    });

    socket.on(worldEventNames.worldCorpses, (payload) => {
      setCorpses(payload.corpses);
    });

    socket.on(worldEventNames.worldGroundItems, (payload) => {
      setGroundItems(payload.groundItems);
    });

    socket.on(worldEventNames.playerJoined, (payload) => {
      setPlayers((currentPlayers) => upsertWorldPlayer(currentPlayers, payload.player));
    });

    socket.on(worldEventNames.playerMoved, (payload) => {
      setPlayers((currentPlayers) => upsertWorldPlayer(currentPlayers, payload.player));
    });

    socket.on(worldEventNames.playerLeft, (payload) => {
      setPlayers((currentPlayers) => removeWorldPlayer(currentPlayers, payload.characterId));
    });

    socket.on(worldEventNames.monsterSpawned, (payload) => {
      setMonsters((currentMonsters) => upsertWorldMonster(currentMonsters, payload.monster));
    });

    socket.on(worldEventNames.monsterDamaged, (payload) => {
      setMonsters((currentMonsters) =>
        updateWorldMonster(currentMonsters, payload.monsterId, {
          health: payload.health,
          maxHealth: payload.maxHealth
        })
      );
    });

    socket.on(worldEventNames.monsterDied, (payload) => {
      setMonsters((currentMonsters) => upsertWorldMonster(currentMonsters, payload.monster));
      setActiveCombatMonsterId((currentMonsterId) =>
        currentMonsterId === payload.monsterId ? null : currentMonsterId
      );
    });

    socket.on(worldEventNames.monsterMoved, (payload) => {
      setMonsters((currentMonsters) => upsertWorldMonster(currentMonsters, payload.monster));
    });

    socket.on(worldEventNames.monsterRespawned, (payload) => {
      setMonsters((currentMonsters) => upsertWorldMonster(currentMonsters, payload.monster));
    });

    socket.on(worldEventNames.corpseCreated, (payload) => {
      setCorpses((currentCorpses) => upsertCorpse(currentCorpses, payload.corpse));
    });

    socket.on(worldEventNames.corpseRemoved, (payload) => {
      setCorpses((currentCorpses) => removeCorpse(currentCorpses, payload.corpseId));
      setOpenedCorpses((currentCorpses) => removeCorpse(currentCorpses, payload.corpseId));
    });

    socket.on(worldEventNames.corpseOpened, (payload) => {
      setLootErrorMessage(null);
      setOpenedCorpses((currentCorpses) => upsertOpenedCorpse(currentCorpses, payload.corpse));
      setCorpses((currentCorpses) => upsertCorpse(currentCorpses, payload.corpse));
    });

    socket.on(worldEventNames.corpseUpdated, (payload) => {
      setOpenedCorpses((currentCorpses) =>
        currentCorpses.some((corpse) => corpse.id === payload.corpse.id)
          ? upsertOpenedCorpse(currentCorpses, payload.corpse)
          : currentCorpses
      );
      setCorpses((currentCorpses) => upsertCorpse(currentCorpses, payload.corpse));
    });

    socket.on(worldEventNames.corpseError, (payload: CorpseErrorEvent) => {
      setLootErrorMessage(null);
      setFeedbackMessage(getCorpseErrorMessage(payload));
    });

    socket.on(worldEventNames.groundItemCreated, (payload) => {
      setGroundItems((currentGroundItems) => [
        ...currentGroundItems.filter((groundItem) => groundItem.id !== payload.groundItem.id),
        payload.groundItem
      ]);
    });

    socket.on(worldEventNames.groundItemRemoved, (payload) => {
      setGroundItems((currentGroundItems) => currentGroundItems.filter((groundItem) => groundItem.id !== payload.groundItemId));
    });

    socket.on(worldEventNames.groundItemError, (payload: GroundItemErrorEvent) => {
      setFeedbackMessage(payload.message);
    });

    socket.on(worldEventNames.inventoryUpdated, (payload) => {
      setFeedbackMessage(payload.message ?? "Inventory updated.");
    });

    socket.on(worldEventNames.inventoryError, (payload: InventoryErrorEvent) => {
      setFeedbackMessage(payload.message);
    });

    socket.on(worldEventNames.equipmentUpdated, (payload) => {
      setEquipmentItems(payload.slots);
      setFeedbackMessage(payload.message ?? "Equipment updated.");
    });

    socket.on(worldEventNames.equipmentError, (payload: EquipmentErrorEvent) => {
      setFeedbackMessage(payload.message);
    });

    socket.on(worldEventNames.containerOpened, (payload) => {
      setContainers((currentContainers) => [
        ...currentContainers.filter((container) => container.container.id !== payload.container.id),
        { container: payload.container, slots: payload.slots }
      ]);
      setFeedbackMessage(payload.message ?? `${payload.container.name} opened.`);
    });

    socket.on(worldEventNames.containerUpdated, (payload) => {
      setContainers((currentContainers) =>
        currentContainers.map((container) =>
          container.container.id === payload.container.id ? { container: payload.container, slots: payload.slots } : container
        )
      );
      setFeedbackMessage(payload.message ?? "Container updated.");
    });

    socket.on(worldEventNames.containerError, (payload: ContainerErrorEvent) => {
      setFeedbackMessage(payload.message);
    });

    socket.on(worldEventNames.characterExperienceUpdated, (payload) => {
      setCharacter((currentCharacter) =>
        currentCharacter && currentCharacter.id === payload.characterId
          ? {
              ...currentCharacter,
              experience: payload.experience,
              level: payload.level,
              health: payload.health,
              maxHealth: payload.maxHealth,
              mana: payload.mana,
              maxMana: payload.maxMana
            }
          : currentCharacter
      );
      setPlayers((currentPlayers) =>
        currentPlayers.map((player) =>
          player.characterId === payload.characterId
            ? {
                ...player,
                level: payload.level,
                health: payload.health,
                maxHealth: payload.maxHealth,
                mana: payload.mana,
                maxMana: payload.maxMana
              }
            : player
        )
      );
    });

    socket.on(worldEventNames.characterLevelUp, (payload) => {
      setCharacter((currentCharacter) =>
        currentCharacter && currentCharacter.id === payload.characterId
          ? {
              ...currentCharacter,
              level: payload.level,
              health: payload.health,
              maxHealth: payload.maxHealth,
              mana: payload.mana,
              maxMana: payload.maxMana
            }
          : currentCharacter
      );
      setPlayers((currentPlayers) =>
        currentPlayers.map((player) =>
          player.characterId === payload.characterId
            ? {
                ...player,
                level: payload.level,
                health: payload.health,
                maxHealth: payload.maxHealth,
                mana: payload.mana,
                maxMana: payload.maxMana
              }
            : player
        )
      );
    });

    socket.on(worldEventNames.characterStatsUpdated, (payload) => {
      setCharacter((currentCharacter) =>
        currentCharacter && currentCharacter.id === payload.characterId
          ? {
              ...currentCharacter,
              health: payload.health,
              maxHealth: payload.maxHealth,
              mana: payload.mana,
              maxMana: payload.maxMana
            }
          : currentCharacter
      );
      setPlayers((currentPlayers) =>
        currentPlayers.map((player) =>
          player.characterId === payload.characterId
            ? {
                ...player,
                health: payload.health,
                maxHealth: payload.maxHealth,
                mana: payload.mana,
                maxMana: payload.maxMana
              }
            : player
        )
      );
    });

    socket.on(worldEventNames.combatStarted, (payload) => {
      setActiveCombatMonsterId(payload.monsterId);
    });

    socket.on(worldEventNames.combatStopped, () => {
      setActiveCombatMonsterId(null);
    });

    socket.on(worldEventNames.combatError, (payload: CombatErrorEvent) => {
      setFeedbackMessage(payload.message);
    });

    socket.on(worldEventNames.worldError, (payload: WorldErrorEvent) => {
      setWorldErrorMessage(payload.message);

      if (
        payload.code === "unauthenticated" ||
        payload.code === "invalid_character_id" ||
        payload.code === "character_already_online" ||
        payload.code === "world_join_failed"
      ) {
        setConnectionState("error");
      }
    });

    socket.on("disconnect", (reason) => {
      setActiveCombatMonsterId(null);
      setConnectionState("disconnected");
      setContainers([]);
      setCorpses([]);
      setEquipmentItems(equipmentSlots.map((slot) => ({ slot, item: null })));
      setGroundItems([]);
      setMonsters([]);
      setOpenedCorpses([]);
      setPlayers([]);

      if (reason !== "io client disconnect") {
        setWorldErrorMessage("Connection to the world server was lost.");
      }
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [characterId, loadedCharacterId, token]);

  useEffect(() => {
    if (!feedbackMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFeedbackMessage(null);
    }, 3200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [feedbackMessage]);

  const localPlayer = character ? players.find((player) => player.characterId === character.id) ?? null : null;
  const localPosition = character ? localPlayer ?? resolveLocalPlayerSpawn(localMap, character) : null;
  const isWorldReady = character !== null && connectionState === "joined" && localPlayer !== null;
  const containerWindowDescriptors: ContainerWindowDescriptor[] = [
    ...containers.map((container) => ({
      container,
      id: `container:${container.container.id}`,
      type: "container" as const
    })),
    ...openedCorpses.map((corpse) => ({
      corpse,
      id: `corpse:${corpse.id}`,
      type: "corpse" as const
    })),
    ...(lootErrorMessage ? [{ id: "loot-error", type: "loot-error" as const }] : [])
  ];
  const containerWindowIds = containerWindowDescriptors.map((windowDescriptor) => windowDescriptor.id).join("|");
  const containerWorkspaceHeight = getContainerWorkspaceHeight(containerWindowDescriptors.length, containerWorkspaceWidth);

  useEffect(() => {
    const workspaceElement = containerWorkspaceRef.current;

    if (!workspaceElement) {
      return;
    }

    const updateWorkspaceWidth = () => {
      setContainerWorkspaceWidth(workspaceElement.clientWidth);
    };

    updateWorkspaceWidth();

    const resizeObserver = new ResizeObserver(updateWorkspaceWidth);
    resizeObserver.observe(workspaceElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isWorldReady]);

  useEffect(() => {
    setContainerWindowPositions((currentPositions) => {
      const nextPositions: Record<string, ContainerWindowPosition> = {};
      const occupiedPositions: ContainerWindowPosition[] = [];
      const descriptorsWithoutPosition: ContainerWindowDescriptor[] = [];

      containerWindowDescriptors.forEach((windowDescriptor) => {
        const position = currentPositions[windowDescriptor.id];

        if (!position) {
          descriptorsWithoutPosition.push(windowDescriptor);
          return;
        }

        nextPositions[windowDescriptor.id] = position;
        occupiedPositions.push(position);
      });

      descriptorsWithoutPosition.forEach((windowDescriptor) => {
        const position = getFirstAvailableContainerWindowPosition(occupiedPositions, containerWorkspaceWidth);

        nextPositions[windowDescriptor.id] = position;
        occupiedPositions.push(position);
      });

      return nextPositions;
    });
  }, [containerWindowIds, containerWorkspaceWidth]);

  const handleMoveIntent = (direction: MoveDirection) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.playerMove, { direction });
  };

  const handleAttackMonster = (monsterId: string) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.combatAttack, { monsterId });
  };

  const handleOpenCorpse = (corpseId: string) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    if (openedCorpses.some((corpse) => corpse.id === corpseId)) {
      setOpenedCorpses((currentCorpses) => removeCorpse(currentCorpses, corpseId));
      return;
    }

    socket.emit(worldEventNames.corpseOpen, { corpseId });
  };

  const handleTakeCorpseItem = (corpseId: string, corpseItemId: string, quantity: number) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.corpseTakeItem, { corpseId, corpseItemId, quantity });
  };

  const handleDropCorpseItemToGround = (corpseId: string, corpseItemId: string, quantity: number, position: Position) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.corpseDropItem, { corpseId, corpseItemId, quantity, position });
  };

  const handleTakeCorpseItemToTarget = (
    corpseId: string,
    corpseItemId: string,
    quantity: number,
    target: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>
  ) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.corpseTakeItem, { corpseId, corpseItemId, quantity, target });
  };

  const handleDropItemToCorpse = (corpseId: string, itemId: string) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.corpseAddItem, { corpseId, itemId });
  };

  const handleDropItem = (itemId: string, target: InventoryMoveTarget) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.inventoryMoveItem, { itemId, target });
  };

  const handleDropItemToGround = (itemId: string, position: Position) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.inventoryDropItem, { itemId, position });
  };

  const handleTakeGroundItem = (groundItemId: string) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.groundItemTake, { groundItemId });
  };

  const handleMoveGroundItem = (groundItemId: string, position: Position) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.groundItemMove, { groundItemId, position });
  };

  const handleMoveCorpse = (corpseId: string, position: Position) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.corpseMove, { corpseId, position });
  };

  const handleTakeGroundItemToTarget = (
    groundItemId: string,
    target: Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>
  ) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.groundItemTake, { groundItemId, target });
  };

  useEffect(() => {
    const handleGroundItemDragStart = (event: Event) => {
      const detail = (event as CustomEvent<{ clientX: number; clientY: number; groundItemId: string; itemKey: string }>).detail;

      if (!detail?.groundItemId) {
        return;
      }

      draggedGroundItemIdRef.current = detail.groundItemId;
      setGroundDragPreview({
        clientX: detail.clientX,
        clientY: detail.clientY,
        itemKey: detail.itemKey
      });
    };

    const handleGroundItemMouseMove = (event: MouseEvent) => {
      if (!draggedGroundItemIdRef.current) {
        return;
      }

      setGroundDragPreview((currentPreview) =>
        currentPreview
          ? {
              ...currentPreview,
              clientX: event.clientX,
              clientY: event.clientY
            }
          : null
      );
    };

    const handleGroundItemMouseUp = (event: MouseEvent) => {
      const groundItemId = draggedGroundItemIdRef.current;
      draggedGroundItemIdRef.current = null;
      setGroundDragPreview(null);

      if (!groundItemId) {
        return;
      }

      const element = document.elementFromPoint(event.clientX, event.clientY);
      const targetElement = element?.closest("[data-inventory-drop-target]") as HTMLElement | null;
      const rawTarget = targetElement?.dataset.inventoryDropTarget;

      if (!rawTarget) {
        return;
      }

      try {
        const target = JSON.parse(rawTarget) as Extract<InventoryMoveTarget, { locationType: "container" | "equipment" }>;

        if (target.locationType === "container" || target.locationType === "equipment") {
          window.dispatchEvent(
            new CustomEvent("aldrym:ground-item-target-drop", {
              detail: {
                groundItemId,
                target
              }
            })
          );
        }
      } catch {
        return;
      }
    };

    window.addEventListener("aldrym:ground-item-drag-start", handleGroundItemDragStart);
    window.addEventListener("mousemove", handleGroundItemMouseMove);
    window.addEventListener("mouseup", handleGroundItemMouseUp);

    return () => {
      window.removeEventListener("aldrym:ground-item-drag-start", handleGroundItemDragStart);
      window.removeEventListener("mousemove", handleGroundItemMouseMove);
      window.removeEventListener("mouseup", handleGroundItemMouseUp);
    };
  }, [connectionState]);

  const handleQuickEquip = (itemId: string) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.inventoryEquipItem, { itemId });
  };

  const handleOpenContainer = (containerItemId: string) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    if (containers.some((container) => container.container.id === containerItemId)) {
      handleCloseContainer(containerItemId);
      return;
    }

    socket.emit(worldEventNames.containerOpen, { containerItemId });
  };

  const handleCloseContainer = (containerItemId: string) => {
    socketRef.current?.emit(worldEventNames.containerClose, { containerItemId });
    setContainers((currentContainers) => currentContainers.filter((container) => container.container.id !== containerItemId));
  };

  const handleContainerWindowDragStart = (windowId: string, event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    const workspaceElement = containerWorkspaceRef.current;
    const windowElement = event.currentTarget.closest(".container-window-frame") as HTMLElement | null;

    if (!workspaceElement || !windowElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setActiveContainerWindowId(windowId);

    const workspaceRect = workspaceElement.getBoundingClientRect();
    const windowRect = windowElement.getBoundingClientRect();
    const startPosition = containerWindowPositions[windowId] ?? { x: 0, y: 0 };
    const startPointer = { x: event.clientX, y: event.clientY };
    const maximumX = Math.max(0, workspaceRect.width - windowRect.width);
    const maximumY = Math.max(0, containerWorkspaceHeight - windowRect.height);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextX = clampNumber(startPosition.x + moveEvent.clientX - startPointer.x, 0, maximumX);
      const nextY = clampNumber(startPosition.y + moveEvent.clientY - startPointer.y, 0, maximumY);

      setContainerWindowPositions((currentPositions) => ({
        ...currentPositions,
        [windowId]: {
          x: nextX,
          y: nextY
        }
      }));
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  };

  const handleStopCombat = () => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.combatStop);
  };

  useEffect(() => {
    if (connectionState !== "joined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }

      if (activeCombatMonsterId) {
        event.preventDefault();
        handleStopCombat();
        return;
      }

      const target = findNearestVisibleMonster(localPosition, monsters);

      if (!target) {
        return;
      }

      event.preventDefault();
      socketRef.current?.emit(worldEventNames.combatAttack, { monsterId: target.id });
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeCombatMonsterId, connectionState, localPosition, monsters]);

  useEffect(() => {
    if (!localPosition) {
      setOpenedCorpses([]);
      return;
    }

    setOpenedCorpses((currentCorpses) =>
      currentCorpses.filter((corpse) => isInCorpseInteractionRange(localPosition, corpse))
    );
  }, [localPosition]);

  if (!characterId) {
    return (
      <StatusView
        title="Unknown character"
        message="The selected character record could not be found."
        action={
          <Link className="button button--primary" to="/characters">
            Back to Characters
          </Link>
        }
      />
    );
  }

  if (isLoadingCharacter) {
    return <StatusView title="Preparing the travel papers" message="Loading the selected character record." />;
  }

  if (errorMessage || !character) {
    return (
      <StatusView
        title="Could not open the game client"
        message={errorMessage ?? "The selected character record is unavailable."}
        action={
          <Link className="button button--primary" to="/characters">
            Back to Characters
          </Link>
        }
      />
    );
  }

  return (
    <section className="game-client">
      <main className="game-client__main">
        <section className="game-client__stage">
          {isWorldReady ? (
            <div className="game-client__canvas-stack">
              <GameViewport
                activeCombatMonsterId={activeCombatMonsterId}
                corpses={corpses}
                groundItems={groundItems}
                localCharacterId={character.id}
                monsters={monsters}
                noticeMessage={feedbackMessage}
                onAttackMonster={handleAttackMonster}
                onDropCorpseItemToGround={handleDropCorpseItemToGround}
                onDropItemToGround={handleDropItemToGround}
                onMoveCorpse={handleMoveCorpse}
                onMoveGroundItem={handleMoveGroundItem}
                onMoveIntent={handleMoveIntent}
                onOpenCorpse={handleOpenCorpse}
                onShowNotice={setFeedbackMessage}
                onTakeGroundItem={handleTakeGroundItem}
                onTakeGroundItemToTarget={handleTakeGroundItemToTarget}
                players={players}
              />
              <div
                className="game-client__container-workspace"
                data-open={containerWindowDescriptors.length > 0 ? "true" : undefined}
                ref={containerWorkspaceRef}
                style={{ height: containerWindowDescriptors.length > 0 ? containerWorkspaceHeight : 0 }}
              >
                {containerWindowDescriptors.map((windowDescriptor, index) => {
                  const position =
                    containerWindowPositions[windowDescriptor.id] ??
                    getContainerWindowDefaultPosition(index, containerWorkspaceWidth);

                  return (
                    <div
                      className="container-window-frame"
                      data-active={activeContainerWindowId === windowDescriptor.id ? "true" : undefined}
                      key={windowDescriptor.id}
                      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
                    >
                      {windowDescriptor.type === "container" ? (
                        <BackpackWindow
                          container={windowDescriptor.container}
                          onClose={handleCloseContainer}
                          onDropItem={handleDropItem}
                          onTakeCorpseItemToTarget={handleTakeCorpseItemToTarget}
                          onTakeGroundItemToTarget={handleTakeGroundItemToTarget}
                          onOpenContainer={handleOpenContainer}
                          onQuickEquip={handleQuickEquip}
                          onWindowDragStart={(event) => handleContainerWindowDragStart(windowDescriptor.id, event)}
                        />
                      ) : null}
                      {windowDescriptor.type === "corpse" ? (
                        <LootWindow
                          corpse={windowDescriptor.corpse}
                          errorMessage={null}
                          onClose={() => {
                            setOpenedCorpses((currentCorpses) => removeCorpse(currentCorpses, windowDescriptor.corpse.id));
                          }}
                          onDropItemToCorpse={handleDropItemToCorpse}
                          onTakeItem={handleTakeCorpseItem}
                          onWindowDragStart={(event) => handleContainerWindowDragStart(windowDescriptor.id, event)}
                        />
                      ) : null}
                      {windowDescriptor.type === "loot-error" ? (
                        <LootWindow
                          corpse={null}
                          errorMessage={lootErrorMessage}
                          onClose={() => {
                            setLootErrorMessage(null);
                          }}
                          onDropItemToCorpse={handleDropItemToCorpse}
                          onTakeItem={handleTakeCorpseItem}
                          onWindowDragStart={(event) => handleContainerWindowDragStart(windowDescriptor.id, event)}
                        />
                      ) : null}
                    </div>
                  );
                })}
                </div>
            </div>
          ) : (
            <div className="game-stage__fallback">
              <p className="panel-kicker">World Connection</p>
              <h3>{getConnectionLabel(connectionState)}</h3>
              <p className="panel-copy">{getConnectionCopy(connectionState)}</p>
              {worldErrorMessage ? <p className="form-message form-message--error">{worldErrorMessage}</p> : null}
            </div>
          )}

        </section>
      </main>

      <aside className="game-client__sidebar">
        <section className="client-panel">
          <div className="client-panel__header">
            <span>Character</span>
            <strong>Level {character.level} {character.characterClass}</strong>
          </div>
          <h2>{character.name}</h2>
          <Meter current={character.health} label="Health" maximum={character.maxHealth} tone="health" />
          <Meter current={character.mana} label="Mana" maximum={character.maxMana} tone="mana" />
          <dl className="client-stat-grid client-stat-grid--primary">
            <div>
              <dt>Experience</dt>
              <dd>{character.experience}</dd>
            </div>
            <div>
              <dt>Position</dt>
              <dd>
                <PositionLabel position={localPosition} />
              </dd>
            </div>
          </dl>
        </section>

        <section className="client-panel">
          <div className="client-panel__header">
            <span>Equipment</span>
            <strong>{equipmentItems.filter((slot) => slot.item).length} / {equipmentItems.length}</strong>
          </div>
          <EquipmentPanel
            onDropItem={handleDropItem}
            onTakeCorpseItemToTarget={handleTakeCorpseItemToTarget}
            onTakeGroundItemToTarget={handleTakeGroundItemToTarget}
            onOpenContainer={handleOpenContainer}
            onQuickEquip={handleQuickEquip}
            slots={equipmentItems}
          />
        </section>

        <section className="client-panel">
          <div className="client-panel__header">
            <span>Status</span>
            <strong>MVP</strong>
          </div>
          <dl className="client-stat-grid">
            <div>
              <dt>Attack</dt>
              <dd>Basic</dd>
            </div>
            <div>
              <dt>Defense</dt>
              <dd>Basic</dd>
            </div>
            <div>
              <dt>Health</dt>
              <dd>{character.maxHealth}</dd>
            </div>
            <div>
              <dt>Mana</dt>
              <dd>{character.maxMana}</dd>
            </div>
          </dl>
        </section>
        {worldErrorMessage ? <p className="form-message form-message--error">{worldErrorMessage}</p> : null}
      </aside>
      {groundDragPreview ? (
        <img
          alt=""
          className="item-drag-preview"
          draggable={false}
          src={getItemIconPath(groundDragPreview.itemKey)}
          style={{
            left: groundDragPreview.clientX,
            top: groundDragPreview.clientY
          }}
        />
      ) : null}
    </section>
  );
}
