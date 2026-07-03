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
import { useEffect, useRef, useState, type DragEvent } from "react";
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
  onAttackMonster,
  onDropCorpseItemToGround,
  onDropItemToGround,
  onMoveGroundItem,
  onMoveIntent,
  onOpenCorpse,
  onTakeGroundItem,
  players
}: {
  activeCombatMonsterId: string | null;
  corpses: Corpse[];
  groundItems: GroundItem[];
  localCharacterId: string;
  monsters: WorldMonster[];
  onAttackMonster: (monsterId: string) => void;
  onDropCorpseItemToGround: (corpseId: string, corpseItemId: string, quantity: number, position: Position) => void;
  onDropItemToGround: (itemId: string, position: Position) => void;
  onMoveGroundItem: (groundItemId: string, position: Position) => void;
  onMoveIntent: (direction: MoveDirection) => void;
  onOpenCorpse: (corpseId: string) => void;
  onTakeGroundItem: (groundItemId: string) => void;
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
  const moveIntentRef = useRef(onMoveIntent);
  const openCorpseRef = useRef(onOpenCorpse);
  const playersRef = useRef(players);
  const takeGroundItemRef = useRef(onTakeGroundItem);
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
    moveIntentRef.current = onMoveIntent;
  }, [onMoveIntent]);

  useEffect(() => {
    openCorpseRef.current = onOpenCorpse;
  }, [onOpenCorpse]);

  useEffect(() => {
    takeGroundItemRef.current = onTakeGroundItem;
  }, [onTakeGroundItem]);

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
        onMoveGroundItem: (groundItemId, position) => moveGroundItemRef.current(groundItemId, position),
        onMoveIntent: (direction) => moveIntentRef.current(direction),
        onOpenCorpse: (corpseId) => openCorpseRef.current(corpseId),
        onTakeGroundItem: (groundItemId) => takeGroundItemRef.current(groundItemId),
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
    />
  );
}

function LootWindow({
  corpse,
  errorMessage,
  onClose,
  onDropItemToCorpse,
  onTakeItem
}: {
  corpse: Corpse | null;
  errorMessage: string | null;
  onClose: () => void;
  onDropItemToCorpse: (corpseId: string, itemId: string) => void;
  onTakeItem: (corpseId: string, corpseItemId: string, quantity: number) => void;
}) {
  if (!corpse && !errorMessage) {
    return null;
  }

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
      <div className="loot-window__header">
        <strong>{corpse ? `${corpse.monsterName} Corpse` : "Loot"}</strong>
        <button className="loot-window__close" onClick={onClose} type="button">
          x
        </button>
      </div>

      {errorMessage ? <p className="form-message form-message--error">{errorMessage}</p> : null}

      {corpse ? (
        corpse.items.length > 0 ? (
          <ul className="loot-list">
            {corpse.items.map((item) => (
              <li
                className="loot-list__item"
                draggable
                key={item.corpseItemId}
                onDragStart={(event) => {
                  const payload = createCorpseDragPayload(corpse.id, item);
                  window.dispatchEvent(new CustomEvent("aldrym:item-drag-start"));
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-aldrym-item", payload);
                  event.dataTransfer.setData("text/plain", payload);
                }}
              >
                <span>
                  {item.name}
                  {item.quantity > 1 ? ` x${item.quantity}` : ""}
                </span>
                <div>
                  <button onClick={() => onTakeItem(corpse.id, item.corpseItemId, 1)} type="button">
                    One
                  </button>
                  <button onClick={() => onTakeItem(corpse.id, item.corpseItemId, item.quantity)} type="button">
                    All
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-copy">The corpse is empty.</p>
        )
      ) : null}
    </section>
  );
}

function formatEquipmentSlot(slot: EquipmentSlot): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

function createDragPayload(item: InventoryItem, location: DragItemLocation): string {
  return JSON.stringify({
    itemId: item.id,
    location
  } satisfies DragItemPayload);
}

function createCorpseDragPayload(corpseId: string, item: CorpseItem): string {
  return JSON.stringify({
    corpseId,
    corpseItemId: item.corpseItemId,
    quantity: item.quantity,
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
  const target: InventoryMoveTarget | null =
    location.locationType === "container"
      ? { locationType: "container", containerItemId: location.containerItemId, slotIndex: location.slotIndex }
      : location.locationType === "equipment"
        ? { locationType: "equipment", equipmentSlot: location.equipmentSlot }
        : location.locationType === "root"
          ? { locationType: "root", slotIndex: location.slotIndex }
          : null;
  const tooltip = item
    ? `${item.name}${item.stackable ? ` x${item.quantity}` : ""}\nType: ${item.itemType}`
    : label;

  return (
    <div
      aria-grabbed={Boolean(item)}
      className={[
        item ? "game-inventory-bar__item" : "game-inventory-bar__item game-inventory-bar__item--empty",
        dragState === "valid" ? "game-inventory-bar__item--valid-target" : "",
        dragState === "invalid" ? "game-inventory-bar__item--invalid-target" : ""
      ].filter(Boolean).join(" ")}
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
        <>
          <span>{item.name}</span>
          {item.stackable || item.quantity > 1 ? <strong>{item.quantity}</strong> : null}
        </>
      ) : (
        <span>{label}</span>
      )}
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
    <div className="equipment-grid">
      {slots.map((slot) => (
        <ItemSlot
          item={slot.item}
          key={slot.slot}
          label={formatEquipmentSlot(slot.slot)}
          location={{ locationType: "equipment", equipmentSlot: slot.slot }}
          onDropItem={onDropItem}
          onTakeCorpseItemToTarget={onTakeCorpseItemToTarget}
          onTakeGroundItemToTarget={onTakeGroundItemToTarget}
          onOpenContainer={onOpenContainer}
          onQuickEquip={onQuickEquip}
        />
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
  onQuickEquip
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
}) {
  const occupiedSlotCount = container.slots.filter((slot) => slot.item).length;

  return (
    <section className="backpack-window">
      <div className="loot-window__header">
        <strong>{container.container.name}</strong>
        <span>
          {occupiedSlotCount} / {container.slots.length}
        </span>
        <button className="loot-window__close" onClick={() => onClose(container.container.id)} type="button">
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
  const socketRef = useRef<Socket<WorldServerToClientEvents, WorldClientToServerEvents> | null>(null);
  const [activeCombatMonsterId, setActiveCombatMonsterId] = useState<string | null>(null);
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [connectionState, setConnectionState] = useState<WorldConnectionState>("connecting");
  const [containers, setContainers] = useState<ContainerState[]>([]);
  const [corpses, setCorpses] = useState<Corpse[]>([]);
  const [equipmentItems, setEquipmentItems] = useState<EquipmentSlotState[]>(
    equipmentSlots.map((slot) => ({ slot, item: null }))
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
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
      setLootErrorMessage(getCorpseErrorMessage(payload));
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
          player.characterId === payload.characterId ? { ...player, level: payload.level } : player
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

  const localPlayer = character ? players.find((player) => player.characterId === character.id) ?? null : null;
  const localPosition = character ? localPlayer ?? resolveLocalPlayerSpawn(localMap, character) : null;
  const isWorldReady = character !== null && connectionState === "joined" && localPlayer !== null;

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
      const detail = (event as CustomEvent<{ groundItemId: string }>).detail;

      if (!detail?.groundItemId) {
        return;
      }

      draggedGroundItemIdRef.current = detail.groundItemId;
    };

    const handleGroundItemMouseUp = (event: MouseEvent) => {
      const groundItemId = draggedGroundItemIdRef.current;
      draggedGroundItemIdRef.current = null;

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
          handleTakeGroundItemToTarget(groundItemId, target);
        }
      } catch {
        return;
      }
    };

    window.addEventListener("aldrym:ground-item-drag-start", handleGroundItemDragStart);
    window.addEventListener("mouseup", handleGroundItemMouseUp);

    return () => {
      window.removeEventListener("aldrym:ground-item-drag-start", handleGroundItemDragStart);
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
                onAttackMonster={handleAttackMonster}
                onDropCorpseItemToGround={handleDropCorpseItemToGround}
                onDropItemToGround={handleDropItemToGround}
                onMoveGroundItem={handleMoveGroundItem}
                onMoveIntent={handleMoveIntent}
                onOpenCorpse={handleOpenCorpse}
                onTakeGroundItem={handleTakeGroundItem}
                players={players}
              />
              {containers.length > 0 ? (
                <div className="backpack-window-row">
                  {containers.map((container) => (
                    <BackpackWindow
                      container={container}
                      key={container.container.id}
                      onClose={handleCloseContainer}
                      onDropItem={handleDropItem}
                      onTakeCorpseItemToTarget={handleTakeCorpseItemToTarget}
                      onTakeGroundItemToTarget={handleTakeGroundItemToTarget}
                      onOpenContainer={handleOpenContainer}
                      onQuickEquip={handleQuickEquip}
                    />
                  ))}
                </div>
              ) : null}
              {openedCorpses.length > 0 || lootErrorMessage ? (
                <div className="loot-window-row">
                  {openedCorpses.map((corpse) => (
                    <LootWindow
                      corpse={corpse}
                      errorMessage={null}
                      key={corpse.id}
                      onClose={() => {
                        setOpenedCorpses((currentCorpses) => removeCorpse(currentCorpses, corpse.id));
                      }}
                      onDropItemToCorpse={handleDropItemToCorpse}
                      onTakeItem={handleTakeCorpseItem}
                    />
                  ))}
                  {lootErrorMessage ? (
                    <LootWindow
                      corpse={null}
                      errorMessage={lootErrorMessage}
                      onClose={() => {
                        setLootErrorMessage(null);
                      }}
                      onDropItemToCorpse={handleDropItemToCorpse}
                      onTakeItem={handleTakeCorpseItem}
                    />
                  ) : null}
                </div>
              ) : null}
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
            <strong>Level {character.level}</strong>
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

        {feedbackMessage ? <p className="form-message form-message--success">{feedbackMessage}</p> : null}
        {worldErrorMessage ? <p className="form-message form-message--error">{worldErrorMessage}</p> : null}
      </aside>
    </section>
  );
}
