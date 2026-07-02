import type { CharacterSummary, Position } from "@aldrym/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../auth/auth-context";
import { StatusView } from "../components/status-view";
import { createLocalMap, resolveLocalPlayerSpawn } from "../game/map/localMap";
import { fetchCharacter } from "../lib/api";
import { getErrorMessage } from "../lib/api-error";

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
  character,
  onPositionChange
}: {
  character: CharacterSummary;
  onPositionChange: (position: Position) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const mountElement = container;
    let isCancelled = false;
    let cleanup: (() => void) | undefined;

    async function mountGame() {
      const { AldrymGame } = await import("../game/AldrymGame");

      if (isCancelled) {
        return;
      }

      const game = new AldrymGame({
        character,
        onPositionChange,
        parent: mountElement
      });

      cleanup = () => {
        game.destroy();
      };
    }

    void mountGame();

    return () => {
      isCancelled = true;
      cleanup?.();
    };
  }, [character, onPositionChange]);

  return (
    <div className="game-viewport">
      <div className="game-viewport__mount" ref={containerRef} />
    </div>
  );
}

export function GamePage() {
  const { characterId } = useParams();
  const { token } = useAuth();
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [localPosition, setLocalPosition] = useState<Position | null>(null);

  useEffect(() => {
    if (!token || !characterId) {
      setIsLoading(false);
      return;
    }

    const activeToken = token;
    const activeCharacterId = characterId;
    let isCancelled = false;

    async function loadCharacter() {
      setErrorMessage(null);
      setIsLoading(true);

      try {
        const selectedCharacter = await fetchCharacter(activeToken, activeCharacterId);

        if (!isCancelled) {
          setCharacter(selectedCharacter);
          setLocalPosition(resolveLocalPlayerSpawn(createLocalMap(), selectedCharacter));
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(getErrorMessage(error));
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadCharacter();

    return () => {
      isCancelled = true;
    };
  }, [characterId, token]);

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

  if (isLoading) {
    return (
      <StatusView
        title="Preparing the local frontier"
        message="Loading the selected character and building the offline client."
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
          <p className="panel-kicker">Offline Client Step</p>
          <h2>{character.name}</h2>
          <p className="panel-copy">
            This first world-entry page mounts a local Phaser scene with an original tile map,
            camera follow, and offline movement only.
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
              <p className="panel-kicker">Training Ground</p>
              <h3>{character.name}</h3>
            </div>
            <div className="game-position-badge">
              <span>Local Position</span>
              <strong>
                <PositionLabel position={localPosition} />
              </strong>
            </div>
          </div>

          <div className="game-stage">
            <GameViewport character={character} onPositionChange={setLocalPosition} />

            <div className="game-stage__overlay game-stage__overlay--top">
              <span>Level {character.level}</span>
              <span>Offline Local Prototype</span>
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

            <dl className="metric-grid">
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

            <div className="card-actions">
              <Link className="button button--primary" to="/characters">
                Back to Characters
              </Link>
            </div>
          </section>

          <section className="panel game-sidebar">
            <p className="panel-kicker">Walkable Tiles</p>
            <p className="panel-copy">Grass, dirt, and stone are walkable. Water and walls are blocked.</p>
          </section>
        </aside>
      </section>
    </section>
  );
}
