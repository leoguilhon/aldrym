import type { Position } from "@aldrym/shared";

export type LocalTileType = "grass" | "dirt" | "stone" | "water" | "wall";

interface LocalTilePalette {
  baseColor: number;
  accentColor: number;
  edgeColor: number;
  walkable: boolean;
}

export interface LocalMapData {
  width: number;
  height: number;
  tileSize: number;
  defaultSpawn: Position;
  tiles: LocalTileType[][];
}

export const LOCAL_TILE_PALETTE: Record<LocalTileType, LocalTilePalette> = {
  grass: {
    baseColor: 0x56663a,
    accentColor: 0x6f8250,
    edgeColor: 0x334024,
    walkable: true
  },
  dirt: {
    baseColor: 0x755232,
    accentColor: 0x94704a,
    edgeColor: 0x4d3420,
    walkable: true
  },
  stone: {
    baseColor: 0x575753,
    accentColor: 0x787871,
    edgeColor: 0x353531,
    walkable: true
  },
  water: {
    baseColor: 0x294b61,
    accentColor: 0x5f8093,
    edgeColor: 0x162c39,
    walkable: false
  },
  wall: {
    baseColor: 0x413631,
    accentColor: 0x6e645c,
    edgeColor: 0x251d1a,
    walkable: false
  }
};

const LOCAL_MAP_WIDTH = 30;
const LOCAL_MAP_HEIGHT = 20;
const LOCAL_TILE_SIZE = 32;

function createFilledTiles(width: number, height: number, tileType: LocalTileType): LocalTileType[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => tileType));
}

function paintRect(
  tiles: LocalTileType[][],
  startX: number,
  startY: number,
  width: number,
  height: number,
  tileType: LocalTileType
): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      if (tiles[y]?.[x] !== undefined) {
        tiles[y][x] = tileType;
      }
    }
  }
}

function paintCells(tiles: LocalTileType[][], points: Array<{ x: number; y: number }>, tileType: LocalTileType): void {
  for (const point of points) {
    if (tiles[point.y]?.[point.x] !== undefined) {
      tiles[point.y][point.x] = tileType;
    }
  }
}

function isWithinBounds(map: LocalMapData, x: number, y: number): boolean {
  return x >= 0 && x < map.width && y >= 0 && y < map.height;
}

export function createLocalMap(): LocalMapData {
  const tiles = createFilledTiles(LOCAL_MAP_WIDTH, LOCAL_MAP_HEIGHT, "grass");

  paintRect(tiles, 0, 9, 30, 2, "dirt");
  paintRect(tiles, 5, 4, 2, 13, "dirt");
  paintRect(tiles, 4, 8, 4, 4, "dirt");
  paintRect(tiles, 10, 6, 9, 7, "stone");

  paintRect(tiles, 9, 5, 11, 1, "wall");
  paintRect(tiles, 9, 13, 11, 1, "wall");
  paintRect(tiles, 9, 5, 1, 9, "wall");
  paintRect(tiles, 19, 5, 1, 9, "wall");

  paintCells(
    tiles,
    [
      { x: 9, y: 10 },
      { x: 14, y: 13 },
      { x: 19, y: 8 }
    ],
    "dirt"
  );

  paintRect(tiles, 22, 2, 5, 4, "water");
  paintRect(tiles, 23, 6, 3, 2, "water");
  paintCells(
    tiles,
    [
      { x: 21, y: 3 },
      { x: 27, y: 3 },
      { x: 27, y: 4 },
      { x: 26, y: 6 },
      { x: 22, y: 7 }
    ],
    "water"
  );

  paintRect(tiles, 1, 15, 4, 3, "water");
  paintCells(
    tiles,
    [
      { x: 0, y: 16 },
      { x: 4, y: 17 },
      { x: 5, y: 16 }
    ],
    "water"
  );

  paintRect(tiles, 21, 14, 6, 3, "stone");
  paintCells(
    tiles,
    [
      { x: 20, y: 15 },
      { x: 27, y: 15 },
      { x: 24, y: 17 },
      { x: 25, y: 17 }
    ],
    "stone"
  );

  paintCells(
    tiles,
    [
      { x: 12, y: 4 },
      { x: 13, y: 4 },
      { x: 16, y: 4 },
      { x: 17, y: 4 },
      { x: 22, y: 13 },
      { x: 23, y: 13 },
      { x: 2, y: 14 },
      { x: 3, y: 14 }
    ],
    "dirt"
  );

  return {
    width: LOCAL_MAP_WIDTH,
    height: LOCAL_MAP_HEIGHT,
    tileSize: LOCAL_TILE_SIZE,
    defaultSpawn: { x: 6, y: 10, z: 0 },
    tiles
  };
}

export function getTileType(map: LocalMapData, x: number, y: number): LocalTileType | null {
  if (!isWithinBounds(map, x, y)) {
    return null;
  }

  return map.tiles[y][x];
}

export function isWalkableTile(map: LocalMapData, position: Pick<Position, "x" | "y">): boolean {
  const tileType = getTileType(map, position.x, position.y);

  if (!tileType) {
    return false;
  }

  return LOCAL_TILE_PALETTE[tileType].walkable;
}

export function getTileCenter(map: LocalMapData, position: Pick<Position, "x" | "y">): { x: number; y: number } {
  return {
    x: position.x * map.tileSize + map.tileSize / 2,
    y: position.y * map.tileSize + map.tileSize / 2
  };
}

function findNearestWalkablePosition(
  map: LocalMapData,
  origin: Pick<Position, "x" | "y">
): Position | null {
  const maxRadius = Math.max(map.width, map.height);

  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let y = origin.y - radius; y <= origin.y + radius; y += 1) {
      for (let x = origin.x - radius; x <= origin.x + radius; x += 1) {
        if (!isWithinBounds(map, x, y)) {
          continue;
        }

        if (!isWalkableTile(map, { x, y })) {
          continue;
        }

        return { x, y, z: 0 };
      }
    }
  }

  return null;
}

export function resolveLocalPlayerSpawn(map: LocalMapData, position: Position): Position {
  const fallbackPosition = findNearestWalkablePosition(map, map.defaultSpawn) ?? map.defaultSpawn;
  const requestedX = Number.isFinite(position.x) ? Math.round(position.x) : fallbackPosition.x;
  const requestedY = Number.isFinite(position.y) ? Math.round(position.y) : fallbackPosition.y;

  if (!isWithinBounds(map, requestedX, requestedY)) {
    return fallbackPosition;
  }

  return (
    findNearestWalkablePosition(map, { x: requestedX, y: requestedY }) ?? fallbackPosition
  );
}
