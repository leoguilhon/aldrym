import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/auth-context";
import { ProtectedRoute, PublicOnlyRoute } from "./auth/route-guards";
import { StatusView } from "./components/status-view";
import { AuthenticatedLayout } from "./layouts/authenticated-layout";
import { CharacterCreationPage } from "./pages/character-creation-page";
import { CharacterSelectionPage } from "./pages/character-selection-page";
import { LoginPage } from "./pages/login-page";
import { NotFoundPage } from "./pages/not-found-page";
import { RegisterPage } from "./pages/register-page";
import { WorldPlaceholderPage } from "./pages/world-placeholder-page";

function HomeRedirect() {
  const { isAuthenticated } = useAuth();

  return <Navigate replace to={isAuthenticated ? "/characters" : "/login"} />;
}

function AuthenticatedOutlet() {
  return (
    <AuthenticatedLayout>
      <Outlet />
    </AuthenticatedLayout>
  );
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
          <Route path="/characters" element={<CharacterSelectionPage />} />
          <Route path="/characters/create" element={<CharacterCreationPage />} />
          <Route path="/world/:characterId" element={<WorldPlaceholderPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
