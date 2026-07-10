import type { PropsWithChildren } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/auth-context";

export function AuthenticatedLayout({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const {
    activeWorldCharacterId,
    canReturnToCharacterHall,
    logout,
    releaseActiveWorldCharacter,
    user
  } = useAuth();

  const isCharacterHallBlocked = activeWorldCharacterId !== null && !canReturnToCharacterHall;

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleCharacterHallNavigation = (path: "/characters" | "/characters/create") => {
    if (activeWorldCharacterId) {
      if (!canReturnToCharacterHall) {
        return;
      }

      releaseActiveWorldCharacter();
      navigate(path, { replace: true });
      return;
    }

    navigate(path);
  };

  return (
    <div className="layout-shell">
      <header className="panel site-header">
        <div className="site-header__brand">
          <p className="panel-kicker">Aldrym Account Hall</p>
          <h1>Aldrym</h1>
          <p className="site-header__tagline">
            Muster your account, review your roster, and prepare for the frontier.
          </p>
        </div>

        <div className="site-header__actions">
          <nav className="site-nav" aria-label="Primary">
            <NavLink
              aria-disabled={isCharacterHallBlocked || undefined}
              className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}${isCharacterHallBlocked ? " nav-link--disabled" : ""}`}
              onClick={(event) => {
                if (activeWorldCharacterId) {
                  event.preventDefault();
                  handleCharacterHallNavigation("/characters");
                }
              }}
              title={isCharacterHallBlocked ? "Leave battle mode before returning to the character hall." : undefined}
              to="/characters"
            >
              Characters
            </NavLink>
            <NavLink
              aria-disabled={isCharacterHallBlocked || undefined}
              className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}${isCharacterHallBlocked ? " nav-link--disabled" : ""}`}
              onClick={(event) => {
                if (activeWorldCharacterId) {
                  event.preventDefault();
                  handleCharacterHallNavigation("/characters/create");
                }
              }}
              title={isCharacterHallBlocked ? "Leave battle mode before creating another character." : undefined}
              to="/characters/create"
            >
              New Character
            </NavLink>
          </nav>

          <div className="account-box">
            <span className="account-box__label">Signed in as</span>
            <strong>{user?.email ?? "Unknown account"}</strong>
          </div>

          <button className="button button--secondary" onClick={handleLogout} type="button">
            Logout
          </button>
        </div>
      </header>

      <main className="content-shell">{children}</main>
    </div>
  );
}
