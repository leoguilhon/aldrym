import type { CharacterSummary, DeleteCharacterRequest } from "@aldrym/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/auth-context";
import { deleteCharacter, fetchCharacters } from "../lib/api";
import { getErrorMessage } from "../lib/api-error";

function formatGenderLabel(gender: CharacterSummary["gender"]): string {
  return gender === "male" ? "Male" : "Female";
}

function formatCharacterClassLabel(characterClass: CharacterSummary["characterClass"]): string {
  return characterClass.charAt(0).toUpperCase() + characterClass.slice(1);
}

function CharacterCard({
  character,
  activeDeleteCharacterId,
  deleteErrorMessage,
  deletePassword,
  isDeleting,
  onDeleteCharacter,
  onDeletePasswordChange,
  onEnterWorld,
  onStartDelete,
  onCancelDelete
}: {
  character: CharacterSummary;
  activeDeleteCharacterId: string | null;
  deleteErrorMessage: string | null;
  deletePassword: string;
  isDeleting: boolean;
  onDeleteCharacter: (characterId: string) => Promise<void>;
  onDeletePasswordChange: (value: string) => void;
  onEnterWorld: (characterId: string) => void;
  onStartDelete: (characterId: string) => void;
  onCancelDelete: () => void;
}) {
  const isDeleteOpen = activeDeleteCharacterId === character.id;

  return (
    <article className="panel character-card">
      <div className="character-card__header">
        <div>
          <p className="panel-kicker">Roster Entry</p>
          <h2>{character.name}</h2>
        </div>
        <div className="character-pill">Level {character.level}</div>
      </div>

      <dl className="metric-grid">
        <div className="metric">
          <dt>Gender</dt>
          <dd>{formatGenderLabel(character.gender)}</dd>
        </div>
        <div className="metric">
          <dt>Class</dt>
          <dd>{formatCharacterClassLabel(character.characterClass)}</dd>
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

      <div className="card-actions character-card__actions">
        <button
          className="button button--primary"
          onClick={() => onEnterWorld(character.id)}
          type="button"
        >
          Enter World
        </button>
        <button
          className="button button--danger"
          onClick={() => onStartDelete(character.id)}
          type="button"
        >
          Delete Character
        </button>
      </div>

      {isDeleteOpen ? (
        <div className="danger-box">
          <p className="danger-box__title">Confirm character deletion</p>
          <p className="danger-box__copy">
            Type your account password to permanently delete {character.name}.
          </p>

          <label className="field">
            <span>Account password</span>
            <input
              autoComplete="current-password"
              className="input"
              onChange={(event) => onDeletePasswordChange(event.target.value)}
              type="password"
              value={deletePassword}
            />
          </label>

          {deleteErrorMessage ? (
            <p className="form-message form-message--error">{deleteErrorMessage}</p>
          ) : null}

          <div className="card-actions">
            <button
              className="button button--danger"
              disabled={isDeleting}
              onClick={() => void onDeleteCharacter(character.id)}
              type="button"
            >
              {isDeleting ? "Deleting..." : "Confirm Deletion"}
            </button>
            <button
              className="button button--secondary"
              disabled={isDeleting}
              onClick={onCancelDelete}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function CharacterSelectionPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeDeleteCharacterId, setActiveDeleteCharacterId] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [isDeletingCharacter, setIsDeletingCharacter] = useState(false);

  const loadCharacters = async () => {
    if (!token) {
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const roster = await fetchCharacters(token);
      setCharacters(roster);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const openDeleteConfirmation = (characterId: string) => {
    setActiveDeleteCharacterId(characterId);
    setDeletePassword("");
    setDeleteErrorMessage(null);
  };

  const closeDeleteConfirmation = () => {
    setActiveDeleteCharacterId(null);
    setDeletePassword("");
    setDeleteErrorMessage(null);
    setIsDeletingCharacter(false);
  };

  const handleDeleteCharacter = async (characterId: string) => {
    if (!token) {
      return;
    }

    if (!deletePassword) {
      setDeleteErrorMessage("Account password is required.");
      return;
    }

    setDeleteErrorMessage(null);
    setIsDeletingCharacter(true);

    const payload: DeleteCharacterRequest = {
      password: deletePassword
    };

    try {
      await deleteCharacter(token, characterId, payload);
      closeDeleteConfirmation();
      await loadCharacters();
    } catch (error) {
      setDeleteErrorMessage(getErrorMessage(error));
      setIsDeletingCharacter(false);
    }
  };

  useEffect(() => {
    void loadCharacters();
  }, [token]);

  if (!token) {
    return null;
  }

  return (
    <section className="page-stack">
      <section className="panel page-hero">
        <div>
          <p className="panel-kicker">Character Hall</p>
          <h2>Your roster</h2>
          <p className="panel-copy">
            Review each adventurer, inspect their starting state, and choose who will
            enter the world first.
          </p>
        </div>

        <div className="hero-actions">
          <button className="button button--secondary" onClick={() => void loadCharacters()} type="button">
            Refresh Roster
          </button>
          <Link className="button button--primary" to="/characters/create">
            Create Character
          </Link>
        </div>
      </section>

      {errorMessage ? <p className="form-message form-message--error">{errorMessage}</p> : null}

      {isLoading ? (
        <section className="panel empty-state">
          <p className="panel-kicker">Opening the roster</p>
          <h2>Fetching your characters</h2>
          <p className="panel-copy">
            The account hall is loading your saved entries from the backend.
          </p>
        </section>
      ) : null}

      {!isLoading && characters.length === 0 ? (
        <section className="panel empty-state">
          <p className="panel-kicker">No Entries Yet</p>
          <h2>Your ledger is still empty</h2>
          <p className="panel-copy">
            Create your first character to begin assembling a roster for Aldrym.
          </p>
          <Link className="button button--primary" to="/characters/create">
            Create Your First Character
          </Link>
        </section>
      ) : null}

      {!isLoading && characters.length > 0 ? (
        <div className="character-grid">
          {characters.map((character) => (
            <CharacterCard
              activeDeleteCharacterId={activeDeleteCharacterId}
              character={character}
              deleteErrorMessage={deleteErrorMessage}
              deletePassword={deletePassword}
              isDeleting={isDeletingCharacter && activeDeleteCharacterId === character.id}
              key={character.id}
              onCancelDelete={closeDeleteConfirmation}
              onDeleteCharacter={handleDeleteCharacter}
              onDeletePasswordChange={setDeletePassword}
              onEnterWorld={(characterId) => navigate(`/game/${characterId}`)}
              onStartDelete={openDeleteConfirmation}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
