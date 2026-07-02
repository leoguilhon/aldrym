import { Link } from "react-router-dom";

import { useAuth } from "../auth/auth-context";
import { StatusView } from "../components/status-view";

export function NotFoundPage() {
  const { isAuthenticated } = useAuth();

  return (
    <StatusView
      title="Page not found"
      message="The path you requested does not exist in the current Aldrym client."
      action={
        <Link className="button button--primary" to={isAuthenticated ? "/characters" : "/login"}>
          {isAuthenticated ? "Back to Roster" : "Back to Login"}
        </Link>
      }
    />
  );
}
