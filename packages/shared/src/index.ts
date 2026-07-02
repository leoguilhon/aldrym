export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export type CharacterGender = "male" | "female";

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface CreateCharacterRequest {
  name: string;
  gender: CharacterGender;
}

export interface DeleteCharacterRequest {
  password: string;
}

export interface CharacterSummary extends Position {
  id: string;
  name: string;
  gender: CharacterGender;
  level: number;
  experience: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  createdAt: string;
  updatedAt: string;
}
