import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "./auth-context";

export function getAuthenticatedEntryPath(activeWorldCharacterId: string | null): string {
  return activeWorldCharacterId ? `/game/${activeWorldCharacterId}` : "/characters";
}

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate replace to="/login" />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { activeWorldCharacterId, isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate replace to={getAuthenticatedEntryPath(activeWorldCharacterId)} />;
  }

  return <Outlet />;
}
