import type { CharacterGender, CreateCharacterRequest } from "@aldrym/shared";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/auth-context";
import { createCharacter } from "../lib/api";
import { getErrorMessage } from "../lib/api-error";

function normalizeCharacterName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function validateCharacterName(value: string): string | null {
  const normalizedName = normalizeCharacterName(value);

  if (!normalizedName) {
    return "Character name is required.";
  }

  if (normalizedName.length < 3 || normalizedName.length > 20) {
    return "Character name must be between 3 and 20 characters.";
  }

  if (!/^[A-Za-z ]+$/.test(normalizedName)) {
    return "Character names may contain only letters and spaces.";
  }

  return null;
}

function validateGender(value: string): value is CharacterGender {
  return value === "male" || value === "female";
}

function formatGenderLabel(gender: CharacterGender): string {
  return gender === "male" ? "Male" : "Female";
}

export function CharacterCreationPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [gender, setGender] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationError = validateCharacterName(name);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (!validateGender(gender)) {
      setErrorMessage("Character gender is required.");
      return;
    }

    if (!token) {
      setErrorMessage("You must be signed in to create a character.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    const payload: CreateCharacterRequest = {
      name: normalizeCharacterName(name),
      gender
    };

    try {
      await createCharacter(token, payload);
      navigate("/characters", { replace: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="page-stack">
      <section className="panel page-hero">
        <div>
          <p className="panel-kicker">New Roster Entry</p>
          <h2>Create a character</h2>
          <p className="panel-copy">
            Reserve a name, prepare a fresh record, and return to the character hall when
            the entry is complete.
          </p>
        </div>

        <div className="hero-actions">
          <Link className="button button--secondary" to="/characters">
            Back to Roster
          </Link>
        </div>
      </section>

      <section className="panel form-panel">
        <form className="stack-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Character name</span>
            <input
              className="input"
              maxLength={20}
              name="name"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>

          <label className="field">
            <span>Gender</span>
            <select
              className="input"
              name="gender"
              onChange={(event) => setGender(event.target.value)}
              value={gender}
            >
              <option value="">Select a gender</option>
              {(["male", "female"] as CharacterGender[]).map((option) => (
                <option key={option} value={option}>
                  {formatGenderLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <p className="form-hint">
            Use 3 to 20 characters. Names may contain letters and spaces only.
          </p>

          {errorMessage ? <p className="form-message form-message--error">{errorMessage}</p> : null}

          <div className="form-actions">
            <button className="button button--primary" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Creating..." : "Create Character"}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
