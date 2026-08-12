import type { Rng } from '@donjon/shared';

export const TILE_WALL = 0;
export const TILE_FLOOR = 1;
export const TILE_DOOR = 2;
export const TILE_STAIRS = 3;

export const FLOOR_WIDTH = 60;
export const FLOOR_HEIGHT = 40;

export interface Room {
  id: number;
  idx: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface Floor {
  id: number;
  depth: number;
  name: string;
  width: number;
  height: number;
  tiles: Uint8Array;
  rooms: Room[];
  adjacency: number[][];
  entryRoom: number;
  stairsRoom: number;
}

const ROOM_NAMES = [
  'The Rat Exchange',
  'Hall of Modest Expectations',
  'The Dripping Refectory',
  'Guardian Break Room',
  'The Invoice Vault',
  'Corridor of Small Print',
  'The Damp Armoury',
  'Waiting Room B',
  'The Toll Booth',
  'Cellar of Unclaimed Effects',
  'The Splintered Gallery',
  'Stairwell of Regret',
];

const COLS = 4;
const ROWS = 3;
const CELL_W = 15;
const CELL_H = 13;

function carveRect(tiles: Uint8Array, x: number, y: number, w: number, h: number): void {
  for (let ty = y; ty < y + h; ty++) {
    for (let tx = x; tx < x + w; tx++) {
      tiles[ty * FLOOR_WIDTH + tx] = TILE_FLOOR;
    }
  }
}

function carveH(tiles: Uint8Array, x0: number, x1: number, y: number): void {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  for (let x = lo; x <= hi; x++) {
    if (tiles[y * FLOOR_WIDTH + x] === TILE_WALL) tiles[y * FLOOR_WIDTH + x] = TILE_FLOOR;
  }
}

function carveV(tiles: Uint8Array, y0: number, y1: number, x: number): void {
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  for (let y = lo; y <= hi; y++) {
    if (tiles[y * FLOOR_WIDTH + x] === TILE_WALL) tiles[y * FLOOR_WIDTH + x] = TILE_FLOOR;
  }
}

export function buildFloor0(): Floor {
  const tiles = new Uint8Array(FLOOR_WIDTH * FLOOR_HEIGHT).fill(TILE_WALL);
  const rooms: Room[] = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      const x = c * CELL_W + 2;
      const y = r * CELL_H + 2;
      const w = CELL_W - 5;
      const h = CELL_H - 5;
      carveRect(tiles, x, y, w, h);
      rooms.push({
        id: idx + 1,
        idx,
        name: ROOM_NAMES[idx] ?? `Room ${idx}`,
        x,
        y,
        w,
        h,
        cx: x + (w >> 1),
        cy: y + (h >> 1),
      });
    }
  }

  const adjacency: number[][] = rooms.map(() => []);
  const link = (a: number, b: number): void => {
    adjacency[a]?.push(b);
    adjacency[b]?.push(a);
  };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const idx = r * COLS + c;
      const here = rooms[idx];
      if (!here) continue;
      if (c + 1 < COLS) {
        const east = rooms[idx + 1];
        if (east) {
          carveH(tiles, here.cx, east.cx, here.cy);
          carveV(tiles, here.cy, east.cy, east.cx);
          link(idx, idx + 1);
        }
      }
      if (r + 1 < ROWS) {
        const south = rooms[idx + COLS];
        if (south) {
          carveV(tiles, here.cy, south.cy, here.cx);
          carveH(tiles, here.cx, south.cx, south.cy);
          link(idx, idx + COLS);
        }
      }
    }
  }

  const stairs = rooms[rooms.length - 1];
  if (stairs) tiles[stairs.cy * FLOOR_WIDTH + stairs.cx] = TILE_STAIRS;

  return {
    id: 1,
    depth: 1,
    name: 'The Ground Floor',
    width: FLOOR_WIDTH,
    height: FLOOR_HEIGHT,
    tiles,
    rooms,
    adjacency,
    entryRoom: 0,
    stairsRoom: rooms.length - 1,
  };
}

export function pathBetween(floor: Floor, from: number, to: number, rng: Rng): Array<[number, number]> {
  const a = floor.rooms[from];
  const b = floor.rooms[to];
  if (!a || !b) return [];
  const horizontalFirst = rng.chance(0.5);
  const path: Array<[number, number]> = [];
  let x = a.cx;
  let y = a.cy;

  const stepTo = (tx: number, ty: number): void => {
    while (x !== tx) {
      x += x < tx ? 1 : -1;
      path.push([x, y]);
    }
    while (y !== ty) {
      y += y < ty ? 1 : -1;
      path.push([x, y]);
    }
  };

  if (horizontalFirst) {
    stepTo(b.cx, y);
    stepTo(b.cx, b.cy);
  } else {
    stepTo(x, b.cy);
    stepTo(b.cx, b.cy);
  }
  return path;
}
