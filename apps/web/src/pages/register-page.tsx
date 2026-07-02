import type { RegisterRequest } from "@aldrym/shared";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/auth-context";
import { getErrorMessage } from "../lib/api-error";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password) {
      setErrorMessage("Email and password are required.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Confirm password must match the password.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    const payload: RegisterRequest = {
      email: email.trim(),
      password
    };

    try {
      await register(payload);
      navigate("/characters", { replace: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="panel auth-panel">
        <p className="panel-kicker">New Ledger</p>
        <h1>Create an account</h1>
        <p className="panel-copy">
          Open your account, claim your first roster slot, and prepare for the first
          journey.
        </p>

        <form className="stack-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              className="input"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              autoComplete="new-password"
              className="input"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>

          <label className="field">
            <span>Confirm password</span>
            <input
              autoComplete="new-password"
              className="input"
              name="confirmPassword"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />
          </label>

          {errorMessage ? <p className="form-message form-message--error">{errorMessage}</p> : null}

          <button className="button button--primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Registering..." : "Register"}
          </button>
        </form>

        <p className="form-switch">
          Already registered? <Link to="/login">Sign in here</Link>.
        </p>
      </section>
    </main>
  );
}
