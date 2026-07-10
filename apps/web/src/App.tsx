import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";

import { useAuth } from "./auth/auth-context";
import { getAuthenticatedEntryPath, ProtectedRoute, PublicOnlyRoute } from "./auth/route-guards";
import { StatusView } from "./components/status-view";
import { AuthenticatedLayout } from "./layouts/authenticated-layout";
import { CharacterCreationPage } from "./pages/character-creation-page";
import { CharacterSelectionPage } from "./pages/character-selection-page";
import { GamePage } from "./pages/game-page";
import { LoginPage } from "./pages/login-page";
import { NotFoundPage } from "./pages/not-found-page";
import { RegisterPage } from "./pages/register-page";

function HomeRedirect() {
  const { activeWorldCharacterId, isAuthenticated } = useAuth();

  return <Navigate replace to={isAuthenticated ? getAuthenticatedEntryPath(activeWorldCharacterId) : "/login"} />;
}

function AuthenticatedOutlet() {
  return (
    <AuthenticatedLayout>
      <Outlet />
    </AuthenticatedLayout>
  );
}

function LegacyWorldRedirect() {
  const { activeWorldCharacterId } = useAuth();
  const { characterId } = useParams();

  if (activeWorldCharacterId) {
    return <Navigate replace to={`/game/${activeWorldCharacterId}`} />;
  }

  if (!characterId) {
    return <Navigate replace to="/characters" />;
  }

  return <Navigate replace to={`/game/${characterId}`} />;
}

function RosterRouteGuard() {
  const { activeWorldCharacterId } = useAuth();

  if (activeWorldCharacterId) {
    return <Navigate replace to={`/game/${activeWorldCharacterId}`} />;
  }

  return <Outlet />;
}

function ActiveWorldGameRoute() {
  const { activeWorldCharacterId } = useAuth();
  const { characterId } = useParams();

  if (activeWorldCharacterId && characterId && activeWorldCharacterId !== characterId) {
    return <Navigate replace to={`/game/${activeWorldCharacterId}`} />;
  }

  return <GamePage />;
}

function App() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <StatusView
        title="Opening the account ledger"
        message="Checking your saved session before the roster is shown."
      />
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />

      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AuthenticatedOutlet />}>
          <Route element={<RosterRouteGuard />}>
            <Route path="/characters" element={<CharacterSelectionPage />} />
            <Route path="/characters/create" element={<CharacterCreationPage />} />
          </Route>
          <Route path="/game/:characterId" element={<ActiveWorldGameRoute />} />
          <Route path="/world/:characterId" element={<LegacyWorldRedirect />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
