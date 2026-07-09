import type { LocalTileType } from "@aldrym/shared";

export {
  createLocalMap,
  getNextPosition,
  getTileCenter,
  getTileType,
  isMoveDirection,
  isProtectionZone,
  isWalkableTile,
  isWithinMapBounds,
  moveDirections,
  resolveLocalPlayerSpawn,
  type LocalMapData,
  type LocalTileType,
  type MoveDirection
} from "@aldrym/shared";

interface LocalTilePalette {
  baseColor: number;
  accentColor: number;
  edgeColor: number;
  walkable: boolean;
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
