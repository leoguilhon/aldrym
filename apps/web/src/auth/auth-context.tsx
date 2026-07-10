import type { AuthResponse, AuthUser, LoginRequest, RegisterRequest } from "@aldrym/shared";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren
} from "react";

import { fetchCurrentUser, loginAccount, registerAccount } from "../lib/api";
import {
  clearStoredAccessToken,
  readStoredAccessToken,
  writeStoredAccessToken
} from "./auth-storage";

interface AuthContextValue {
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly token: string | null;
  readonly user: AuthUser | null;
  readonly activeWorldCharacterId: string | null;
  readonly canReturnToCharacterHall: boolean;
  login: (payload: LoginRequest) => Promise<AuthUser>;
  register: (payload: RegisterRequest) => Promise<AuthUser>;
  logout: () => void;
  loadCurrentUser: () => Promise<void>;
  setActiveWorldCharacterId: (characterId: string | null) => void;
  setCanReturnToCharacterHall: (value: boolean) => void;
  releaseActiveWorldCharacter: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function storeSession(response: AuthResponse, setToken: (token: string) => void, setUser: (user: AuthUser) => void) {
  writeStoredAccessToken(response.accessToken);
  setToken(response.accessToken);
  setUser(response.user);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [token, setToken] = useState<string | null>(() => readStoredAccessToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [canReturnToCharacterHall, setCanReturnToCharacterHall] = useState(false);
  const [isLoading, setIsLoading] = useState<boolean>(() => readStoredAccessToken() !== null);

  const clearSession = () => {
    clearStoredAccessToken();
    setToken(null);
    setUser(null);
    setCanReturnToCharacterHall(false);
  };

  const loadCurrentUser = async () => {
    const storedToken = readStoredAccessToken();

    if (!storedToken) {
      clearSession();
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const currentUser = await fetchCurrentUser(storedToken);
      writeStoredAccessToken(storedToken);
      setToken(storedToken);
      setUser(currentUser);
    } catch (error) {
      clearSession();
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (payload: LoginRequest) => {
    const response = await loginAccount(payload);
    storeSession(response, setToken, setUser);
    return response.user;
  };

  const register = async (payload: RegisterRequest) => {
    const response = await registerAccount(payload);
    storeSession(response, setToken, setUser);
    return response.user;
  };

  const logout = () => {
    clearSession();
    setIsLoading(false);
  };

  const setActiveWorldCharacterId = (characterId: string | null) => {
    setUser((currentUser) =>
      currentUser
        ? {
            ...currentUser,
            activeWorldCharacterId: characterId
          }
        : currentUser
    );
  };

  const releaseActiveWorldCharacter = () => {
    setActiveWorldCharacterId(null);
    setCanReturnToCharacterHall(false);
  };

  useEffect(() => {
    const storedToken = readStoredAccessToken();

    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    const activeToken = storedToken;
    let isCancelled = false;

    async function restoreSession() {
      try {
        const currentUser = await fetchCurrentUser(activeToken);

        if (isCancelled) {
          return;
        }

        setToken(activeToken);
        setUser(currentUser);
      } catch {
        if (!isCancelled) {
          clearSession();
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider
        value={{
          isAuthenticated: token !== null && user !== null,
          isLoading,
          token,
          user,
          activeWorldCharacterId: user?.activeWorldCharacterId ?? null,
          canReturnToCharacterHall,
          login,
          register,
          logout,
          loadCurrentUser,
          setActiveWorldCharacterId,
          setCanReturnToCharacterHall,
          releaseActiveWorldCharacter
        }}
      >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
