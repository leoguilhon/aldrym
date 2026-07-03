import type {
  CharacterSummary,
  CombatErrorEvent,
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

type WorldConnectionState =
  | "connecting"
  | "connected"
  | "joined"
  | "disconnected"
  | "error";

const localMap = createLocalMap();
const playerScreenTileHalfHeight = 5;
const playerScreenTileHalfWidth = 7;

function upsertWorldPlayer(players: WorldPlayer[], nextPlayer: WorldPlayer): WorldPlayer[] {
  const existingIndex = players.findIndex((player) => player.characterId === nextPlayer.characterId);

  if (existingIndex === -1) {
    return [...players, nextPlayer];
  }

  return players.map((player) =>
    player.characterId === nextPlayer.characterId ? nextPlayer : player
  );
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
      return "Joined World";
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
      return "Socket connection is open. Waiting for the world join response.";
    case "joined":
      return "World connection is active and movement is now server-authoritative.";
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
  localCharacterId,
  monsters,
  onAttackMonster,
  onMoveIntent,
  players
}: {
  activeCombatMonsterId: string | null;
  localCharacterId: string;
  monsters: WorldMonster[];
  onAttackMonster: (monsterId: string) => void;
  onMoveIntent: (direction: MoveDirection) => void;
  players: WorldPlayer[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<{
    destroy: () => void;
    setActiveCombatMonsterId: (monsterId: string | null) => void;
    setMonsters: (nextMonsters: WorldMonster[]) => void;
    setPlayers: (nextPlayers: WorldPlayer[]) => void;
  } | null>(null);
  const attackMonsterRef = useRef(onAttackMonster);
  const activeCombatMonsterIdRef = useRef(activeCombatMonsterId);
  const monstersRef = useRef(monsters);
  const moveIntentRef = useRef(onMoveIntent);
  const playersRef = useRef(players);

  useEffect(() => {
    attackMonsterRef.current = onAttackMonster;
  }, [onAttackMonster]);

  useEffect(() => {
    activeCombatMonsterIdRef.current = activeCombatMonsterId;
    gameRef.current?.setActiveCombatMonsterId(activeCombatMonsterId);
  }, [activeCombatMonsterId]);

  useEffect(() => {
    monstersRef.current = monsters;
    gameRef.current?.setMonsters(monsters);
  }, [monsters]);

  useEffect(() => {
    moveIntentRef.current = onMoveIntent;
  }, [onMoveIntent]);

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
        localCharacterId,
        monsters: monstersRef.current,
        onAttackMonster: (monsterId) => attackMonsterRef.current(monsterId),
        onMoveIntent: (direction) => moveIntentRef.current(direction),
        parent: mountElement,
        players: playersRef.current
      });

      gameRef.current = game;
      game.setActiveCombatMonsterId(activeCombatMonsterIdRef.current);
      game.setPlayers(playersRef.current);
      game.setMonsters(monstersRef.current);
    }

    void mountGame();

    return () => {
      isCancelled = true;
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, [localCharacterId]);

  return (
    <div className="game-viewport">
      <div className="game-viewport__mount" ref={containerRef} />
    </div>
  );
}

export function GamePage() {
  const { characterId } = useParams();
  const { token } = useAuth();
  const socketRef = useRef<Socket<WorldServerToClientEvents, WorldClientToServerEvents> | null>(null);
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(true);
  const [connectionState, setConnectionState] = useState<WorldConnectionState>("connecting");
  const [activeCombatMonsterId, setActiveCombatMonsterId] = useState<string | null>(null);
  const [monsters, setMonsters] = useState<WorldMonster[]>([]);
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
      auth: {
        token
      },
      reconnection: false,
      transports: ["websocket"]
    });

    socketRef.current = socket;
    setConnectionState("connecting");
    setActiveCombatMonsterId(null);
    setMonsters([]);
    setPlayers([]);
    setWorldErrorMessage(null);

    socket.on("connect", () => {
      setConnectionState("connected");
      setWorldErrorMessage(null);
      socket.emit(worldEventNames.worldJoin, {
        characterId
      });
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

    socket.on(worldEventNames.combatStopped, (payload) => {
      setActiveCombatMonsterId(null);

    });

    socket.on(worldEventNames.combatError, (payload: CombatErrorEvent) => {
      console.warn(payload.message);
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
      setConnectionState("disconnected");
      setActiveCombatMonsterId(null);
      setMonsters([]);
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

  const localPlayer =
    character ? players.find((player) => player.characterId === character.id) ?? null : null;
  const localPosition =
    character ? localPlayer ?? resolveLocalPlayerSpawn(localMap, character) : null;
  const aliveMonsters = monsters.filter((monster) => monster.alive);
  const firstAliveMonster = aliveMonsters[0] ?? null;
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
    return (
      <StatusView
        title="Preparing the travel papers"
        message="Loading the selected character record before the world connection starts."
      />
    );
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
    <section className="page-stack">
      <section className="panel page-hero">
        <div>
          <p className="panel-kicker">Multiplayer Client Step</p>
          <h2>{character.name}</h2>
          <p className="panel-copy">
            World join and movement are now routed through Socket.IO. The server owns the
            final position, while Phaser renders both the local player and other online
            players with placeholder shapes.
          </p>
        </div>

        <div className="hero-actions">
          <Link className="button button--secondary" to="/characters">
            Back to Characters
          </Link>
        </div>
      </section>

      <section className="game-layout">
        <section className="panel game-panel">
          <div className="game-panel__toolbar">
            <div>
              <p className="panel-kicker">Shared Training Ground</p>
              <h3>{character.name}</h3>
            </div>
            <div className="game-position-badge">
              <span>Current Position</span>
              <strong>
                <PositionLabel position={localPosition} />
              </strong>
            </div>
          </div>

          <div className="game-stage">
            {isWorldReady ? (
              <GameViewport
                activeCombatMonsterId={activeCombatMonsterId}
                localCharacterId={character.id}
                monsters={monsters}
                onAttackMonster={handleAttackMonster}
                onMoveIntent={handleMoveIntent}
                players={players}
              />
            ) : (
              <div className="game-stage__fallback">
                <p className="panel-kicker">World Connection</p>
                <h3>{getConnectionLabel(connectionState)}</h3>
                <p className="panel-copy">{getConnectionCopy(connectionState)}</p>
                {worldErrorMessage ? (
                  <p className="form-message form-message--error">{worldErrorMessage}</p>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <aside className="page-stack">
          <section className="panel game-sidebar">
            <div className="character-card__header">
              <div>
                <p className="panel-kicker">Character Sheet</p>
                <h3>{character.name}</h3>
              </div>
              <div className="character-pill">Level {character.level}</div>
            </div>

            <Meter current={character.health} label="Health" maximum={character.maxHealth} tone="health" />
            <Meter current={character.mana} label="Mana" maximum={character.maxMana} tone="mana" />

            <dl className="metric-grid game-state-grid">
              <div className="metric">
                <dt>World State</dt>
                <dd>{getConnectionLabel(connectionState)}</dd>
              </div>
              <div className="metric">
                <dt>Online Players</dt>
                <dd>{players.length}</dd>
              </div>
              <div className="metric">
                <dt>Monsters</dt>
                <dd>{aliveMonsters.length}</dd>
              </div>
              <div className="metric">
                <dt>Nearest Monster</dt>
                <dd>
                  {firstAliveMonster ? (
                    <>
                      {firstAliveMonster.x}, {firstAliveMonster.y}, {firstAliveMonster.z}
                    </>
                  ) : (
                    "None"
                  )}
                </dd>
              </div>
              <div className="metric">
                <dt>Experience</dt>
                <dd>{character.experience}</dd>
              </div>
              <div className="metric">
                <dt>Local Position</dt>
                <dd>
                  <PositionLabel position={localPosition} />
                </dd>
              </div>
            </dl>

            {worldErrorMessage ? (
              <p className="form-message form-message--error">{worldErrorMessage}</p>
            ) : null}

            <div className="card-actions">
              <Link className="button button--primary" to="/characters">
                Back to Characters
              </Link>
            </div>
          </section>

          <section className="panel game-sidebar">
            <p className="panel-kicker">World Notes</p>
            <p className="panel-copy">
              Visible monsters can be targeted from range. Combat damage only lands from
              adjacent tiles, and progression is resolved by the server.
            </p>
          </section>
        </aside>
      </section>
    </section>
  );
}
