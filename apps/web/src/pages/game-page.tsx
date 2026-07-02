import type {
  CharacterSummary,
  MoveDirection,
  Position,
  WorldClientToServerEvents,
  WorldErrorEvent,
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
  localCharacterId,
  onMoveIntent,
  players
}: {
  localCharacterId: string;
  onMoveIntent: (direction: MoveDirection) => void;
  players: WorldPlayer[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<{
    destroy: () => void;
    setPlayers: (nextPlayers: WorldPlayer[]) => void;
  } | null>(null);
  const moveIntentRef = useRef(onMoveIntent);

  useEffect(() => {
    moveIntentRef.current = onMoveIntent;
  }, [onMoveIntent]);

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
        localCharacterId,
        onMoveIntent: (direction) => moveIntentRef.current(direction),
        parent: mountElement,
        players
      });

      gameRef.current = game;
    }

    void mountGame();

    return () => {
      isCancelled = true;
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, [localCharacterId]);

  useEffect(() => {
    gameRef.current?.setPlayers(players);
  }, [players]);

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

  useEffect(() => {
    if (!token || !characterId || !character) {
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

    socket.on(worldEventNames.playerJoined, (payload) => {
      setPlayers((currentPlayers) => upsertWorldPlayer(currentPlayers, payload.player));
    });

    socket.on(worldEventNames.playerMoved, (payload) => {
      setPlayers((currentPlayers) => upsertWorldPlayer(currentPlayers, payload.player));
    });

    socket.on(worldEventNames.playerLeft, (payload) => {
      setPlayers((currentPlayers) => removeWorldPlayer(currentPlayers, payload.characterId));
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
  }, [character, characterId, token]);

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

  const localPlayer =
    players.find((player) => player.characterId === character.id) ?? null;
  const localPosition =
    localPlayer ?? resolveLocalPlayerSpawn(localMap, character);
  const isWorldReady = connectionState === "joined" && localPlayer !== null;

  const handleMoveIntent = (direction: MoveDirection) => {
    const socket = socketRef.current;

    if (!socket || !socket.connected || connectionState !== "joined") {
      return;
    }

    socket.emit(worldEventNames.playerMove, { direction });
  };

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
                localCharacterId={character.id}
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

            <div className="game-stage__overlay game-stage__overlay--top">
              <span>Level {character.level}</span>
              <span>{getConnectionLabel(connectionState)}</span>
            </div>

            <div className="game-stage__overlay game-stage__overlay--bottom">
              <span>Move with WASD or arrow keys.</span>
            </div>
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
              Joined players appear as generated figures with names above them. Blocked
              movement is rejected by the server and does not move the local player.
            </p>
          </section>
        </aside>
      </section>
    </section>
  );
}
