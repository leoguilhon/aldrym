import type { CharacterSummary } from "@aldrym/shared";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../auth/auth-context";
import { StatusView } from "../components/status-view";
import { fetchCharacter } from "../lib/api";
import { getErrorMessage } from "../lib/api-error";

function formatGenderLabel(gender: CharacterSummary["gender"]): string {
  return gender === "male" ? "Male" : "Female";
}

export function WorldPlaceholderPage() {
  const { characterId } = useParams();
  const { token } = useAuth();
  const [character, setCharacter] = useState<CharacterSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
            Back to Roster
          </Link>
        }
      />
    );
  }

  if (isLoading) {
    return (
      <StatusView
        title="Preparing the travel papers"
        message="Loading the selected character record."
      />
    );
  }

  if (errorMessage || !character) {
    return (
      <StatusView
        title="Could not open the travel papers"
        message={errorMessage ?? "The selected character record is unavailable."}
        action={
          <Link className="button button--primary" to="/characters">
            Back to Roster
          </Link>
        }
      />
    );
  }

  return (
    <section className="page-stack">
      <section className="panel page-hero">
        <div>
          <p className="panel-kicker">World Entry</p>
          <h2>{character.name}</h2>
          <p className="panel-copy">Game client coming next.</p>
        </div>

        <div className="hero-actions">
          <Link className="button button--secondary" to="/characters">
            Back to Roster
          </Link>
        </div>
      </section>

      <section className="panel character-card character-card--wide">
        <div className="character-card__header">
          <div>
            <p className="panel-kicker">Selected Entry</p>
            <h2>{character.name}</h2>
          </div>
          <div className="character-pill">Level {character.level}</div>
        </div>

        <p className="panel-copy">
          The authenticated account flow is ready. Phaser, map loading, movement, and the
          actual game client are intentionally still deferred.
        </p>

        <dl className="metric-grid">
          <div className="metric">
            <dt>Gender</dt>
            <dd>{formatGenderLabel(character.gender)}</dd>
          </div>
          <div className="metric">
            <dt>Experience</dt>
            <dd>{character.experience}</dd>
          </div>
          <div className="metric">
            <dt>Health</dt>
            <dd>
              {character.health} / {character.maxHealth}
            </dd>
          </div>
          <div className="metric">
            <dt>Mana</dt>
            <dd>
              {character.mana} / {character.maxMana}
            </dd>
          </div>
          <div className="metric">
            <dt>Position</dt>
            <dd>
              {character.x}, {character.y}, {character.z}
            </dd>
          </div>
        </dl>
      </section>
    </section>
  );
}
