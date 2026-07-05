import type {
  AuthResponse,
  AuthUser,
  CharacterSummary,
  CreateCharacterRequest,
  DeleteCharacterRequest,
  LoginRequest,
  RegisterRequest
} from "@aldrym/shared";

import { ApiError } from "./api-error";

interface ApiErrorResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

const fallbackApiBaseUrl = "http://localhost:41973";

export function getApiBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();

  if (!configuredUrl) {
    return fallbackApiBaseUrl;
  }

  return configuredUrl.replace(/\/+$/, "");
}

function getErrorText(payload: ApiErrorResponse | null, fallback: string): string {
  if (!payload) {
    return fallback;
  }

  if (Array.isArray(payload.message) && payload.message.length > 0) {
    return payload.message.join(" ");
  }

  if (typeof payload.message === "string" && payload.message.length > 0) {
    return payload.message;
  }

  if (typeof payload.error === "string" && payload.error.length > 0) {
    return payload.error;
  }

  return fallback;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    let payload: ApiErrorResponse | null = null;

    try {
      payload = await readJson<ApiErrorResponse>(response);
    } catch {
      payload = null;
    }

    throw new ApiError(
      getErrorText(payload, `Request failed with status ${response.status}.`),
      response.status,
      payload
    );
  }

  return readJson<T>(response);
}

export function registerAccount(payload: RegisterRequest): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function loginAccount(payload: LoginRequest): Promise<AuthResponse> {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function fetchCurrentUser(token: string): Promise<AuthUser> {
  return request<AuthUser>("/auth/me", {}, token);
}

export function fetchCharacters(token: string): Promise<CharacterSummary[]> {
  return request<CharacterSummary[]>("/characters", {}, token);
}

export function fetchCharacter(token: string, characterId: string): Promise<CharacterSummary> {
  return request<CharacterSummary>(`/characters/${characterId}`, {}, token);
}

export function createCharacter(
  token: string,
  payload: CreateCharacterRequest
): Promise<CharacterSummary> {
  return request<CharacterSummary>("/characters", {
    method: "POST",
    body: JSON.stringify(payload)
  }, token);
}

export function deleteCharacter(
  token: string,
  characterId: string,
  payload: DeleteCharacterRequest
): Promise<void> {
  return request<void>(`/characters/${characterId}`, {
    method: "DELETE",
    body: JSON.stringify(payload)
  }, token);
}
