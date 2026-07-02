const accessTokenStorageKey = "aldrym.accessToken";

export function readStoredAccessToken(): string | null {
  return window.localStorage.getItem(accessTokenStorageKey);
}

export function writeStoredAccessToken(token: string): void {
  window.localStorage.setItem(accessTokenStorageKey, token);
}

export function clearStoredAccessToken(): void {
  window.localStorage.removeItem(accessTokenStorageKey);
}
