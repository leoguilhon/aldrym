export interface Position {
  x: number;
  y: number;
  layer: number;
}

export type Direction = "north" | "east" | "south" | "west";

export interface CharacterSummary {
  id: string;
  name: string;
  level: number;
  position: Position;
  direction: Direction;
}

