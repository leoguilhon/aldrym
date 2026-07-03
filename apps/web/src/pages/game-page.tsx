import type {
  CharacterSummary,
  CombatErrorEvent,
  Corpse,
  CorpseErrorEvent,
  InventoryErrorEvent,
  InventoryItem,
  MoveDirection,
  Position,
  WorldClientToServerEvents,
  WorldErrorEvent,
  WorldMonster,
  WorldPlayer,
  WorldServerToClientEvents
} from "@aldrym/shared";
import { createLocalMap, resolveLocalPlayerSpawn, worldEventNames } from "@aldrym/shared";
import { useEffect, useRef, useState } from "react";
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
const equipmentSlots = ["Head", "Body", "Legs", "Weapon", "Shield", "Feet"];
const inventorySlotCount = 10;

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
  localCharacterId,
  monsters,
  onAttackMonster,
  onMoveIntent,
  onOpenCorpse,
  players
}: {
  activeCombatMonsterId: string | null;
  corpses: Corpse[];
  localCharacterId: string;
  monsters: WorldMonster[];
  onAttackMonster: (monsterId: string) => void;
  onMoveIntent: (direction: MoveDirection) => void;
  onOpenCorpse: (corpseId: string) => void;
  players: WorldPlayer[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<{
    destroy: () => void;
    setActiveCombatMonsterId: (monsterId: string | null) => void;
    setCorpses: (nextCorpses: Corpse[]) => void;
    setMonsters: (nextMonsters: WorldMonster[]) => void;
    setPlayers: (nextPlayers: WorldPlayer[]) => void;
  } | null>(null);
  const activeCombatMonsterIdRef = useRef(activeCombatMonsterId);
  const attackMonsterRef = useRef(onAttackMonster);
  const corpsesRef = useRef(corpses);
  const monstersRef = useRef(monsters);
  const moveIntentRef = useRef(onMoveIntent);
  const openCorpseRef = useRef(onOpenCorpse);
  const playersRef = useRef(players);

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
    monstersRef.current = monsters;
    gameRef.current?.setMonsters(monsters);
  }, [monsters]);

  useEffect(() => {
    moveIntentRef.current = onMoveIntent;
  }, [onMoveIntent]);

  useEffect(() => {
    openCorpseRef.current = onOpenCorpse;
  }, [onOpenCorpse]);

  useEffect(() => {
    playersRef.current = players;
    gameRef.current?.setPlayers(players);
  }, [players]);

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
        localCharacterId,
        monsters: monstersRef.current,
        onAttackMonster: (monsterId) => attackMonsterRef.current(monsterId),
        onMoveIntent: (direction) => moveIntentRef.current(direction),
        onOpenCorpse: (corpseId) => openCorpseRef.current(corpseId),
        parent: mountElement,
        players: playersRef.current
      });

      gameRef.current = game;
      game.setActiveCombatMonsterId(activeCombatMonsterIdRef.current);
      game.setCorpses(corpsesRef.current);
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

  return <div className="game-client__viewport-mount" ref={containerRef} />;
}

function LootWindow({
  corpse,
  errorMessage,
  onClose,
  onTakeItem
}: {
  corpse: Corpse | null;
  errorMessage: string | null;
  onClose: () => void;
  onTakeItem: (corpseId: string, corpseItemId: string, quantity: number) => void;
}) {
  if (!corpse && !errorMessage) {
    return null;
  }

  return (
    <section className="loot-window">
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
              <li className="loot-list__item" key={item.corpseItemId}>
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

function HorizontalInventory({ items }: { items: InventoryItem[] }) {
  const slots = Array.from({ length: inventorySlotCount }, (_, index) => items[index] ?? null);

  return (
    <section className="game-inventory-bar">
      <div className="game-inventory-bar__header">
        <span>Inventory</span>
        <strong>
          {items.length} / {inventorySlotCount}
        </strong>
      </div>
      <ul className="game-inventory-bar__items">
        {slots.map((item, index) => (
          <li className={item ? "game-inventory-bar__item" : "game-inventory-bar__item game-inventory-bar__item--empty"} key={item?.id ?? `empty-${index}`}>
            {item ? (
              <>
              <span>{item.name}</span>
              <strong>{item.quantity}</strong>
              </>
            ) : (
              <span>Empty</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GamePage() {
  const { characterId } = useParams();
  const { token } = useAuth();
  const socketRef = useRef<Socket<WorldServerToClientEvents, WorldClientToServerEvents> | null>(null);
  const [activeCombatMonsterId, setActiveCombatMonsterId] = useState<string | null>(null);
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [connectionState, setConnectionState] = useState<WorldConnectionState>("connecting");
  const [corpses, setCorpses] = useState<Corpse[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
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
    setCorpses([]);
    setFeedbackMessage(null);
    setInventoryItems([]);
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

    socket.on(worldEventNames.inventoryUpdated, (payload) => {
      setInventoryItems(payload.items);
      setFeedbackMessage(payload.message ?? "Inventory updated.");
    });

    socket.on(worldEventNames.inventoryError, (payload: InventoryErrorEvent) => {
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
      setCorpses([]);
      setInventoryItems([]);
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
                localCharacterId={character.id}
                monsters={monsters}
                onAttackMonster={handleAttackMonster}
                onMoveIntent={handleMoveIntent}
                onOpenCorpse={handleOpenCorpse}
                players={players}
              />
              <HorizontalInventory items={inventoryItems} />
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
            <strong>Empty</strong>
          </div>
          <div className="equipment-grid">
            {equipmentSlots.map((slot) => (
              <div className="equipment-slot" key={slot}>
                {slot}
              </div>
            ))}
          </div>
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
