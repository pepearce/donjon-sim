import { RngDomain, rngFor, type Rng } from '@donjon/shared';
import { buildApsp } from './apsp.js';
import { TILE_DOOR, TILE_FLOOR, TILE_RUBBLE, TILE_STAIRS, TILE_WALL, type Floor, type Room } from '../engine/types.js';

export const FLOOR_WIDTH = 60;
export const FLOOR_HEIGHT = 40;

const ROOM_ADJECTIVES = [
  'Dripping',
  'Splintered',
  'Damp',
  'Forgotten',
  'Mildewed',
  'Crooked',
  'Sagging',
  'Unaudited',
  'Draughty',
  'Overbudget',
  'Reeking',
  'Provisional',
];

const ROOM_NOUNS = [
  'Refectory',
  'Gallery',
  'Armoury',
  'Vault',
  'Cellar',
  'Exchange',
  'Waiting Room',
  'Toll Booth',
  'Break Room',
  'Archive',
  'Larder',
  'Counting House',
  'Oubliette',
  'Antechamber',
];

const FLOOR_NAMES = [
  'The Ground Floor',
  'The Mezzanine of Regret',
  'The Wet Levels',
  'Accounts Receivable',
  'The Bone Concourse',
  'The Deep Ledger',
  'The Sublet Depths',
  'The Unlit Annexe',
  'The Foreclosed Wing',
  'The Last Invoice',
];

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

function carveRect(tiles: Uint8Array, r: Cell): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      tiles[y * FLOOR_WIDTH + x] = TILE_FLOOR;
    }
  }
}

function carveCorridor(tiles: Uint8Array, ax: number, ay: number, bx: number, by: number, horizontalFirst: boolean): void {
  const put = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= FLOOR_WIDTH || y >= FLOOR_HEIGHT) return;
    if (tiles[y * FLOOR_WIDTH + x] === TILE_WALL) tiles[y * FLOOR_WIDTH + x] = TILE_FLOOR;
  };
  if (horizontalFirst) {
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) put(x, ay);
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) put(bx, y);
  } else {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) put(ax, y);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) put(x, by);
  }
}

function roomName(rng: Rng): string {
  return `The ${rng.pick(ROOM_ADJECTIVES)} ${rng.pick(ROOM_NOUNS)}`;
}

export function corridorHorizontalFirst(from: number, to: number): boolean {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const canonical = ((lo * 31 + hi * 17) & 1) === 0;
  return from === lo ? canonical : !canonical;
}

export function generateFloor(worldSeed: number, depth: number, tick: number): Floor {
  const rng = rngFor(worldSeed, depth, RngDomain.FLOORGEN, depth);
  const tiles = new Uint8Array(FLOOR_WIDTH * FLOOR_HEIGHT).fill(TILE_WALL);

  const cols = rng.int(5, 6);
  const rows = rng.int(4, 5);
  const cellW = Math.floor(FLOOR_WIDTH / cols);
  const cellH = Math.floor(FLOOR_HEIGHT / rows);

  const slots: Array<{ col: number; row: number }> = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push({ col: c, row: r });

  const targetRooms = Math.min(slots.length, rng.int(18, 30));
  for (let i = slots.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const a = slots[i];
    const b = slots[j];
    if (a && b) {
      slots[i] = b;
      slots[j] = a;
    }
  }
  const chosen = slots.slice(0, targetRooms).sort((a, b) => a.row - b.row || a.col - b.col);

  const rooms: Room[] = [];
  const bySlot = new Map<string, number>();

  chosen.forEach((slot, idx) => {
    const maxW = Math.max(3, cellW - 4);
    const maxH = Math.max(3, cellH - 4);
    const w = rng.int(3, maxW);
    const h = rng.int(3, maxH);
    const x = slot.col * cellW + 1 + rng.int(0, Math.max(0, cellW - w - 2));
    const y = slot.row * cellH + 1 + rng.int(0, Math.max(0, cellH - h - 2));
    const rect: Cell = { x, y, w, h };
    carveRect(tiles, rect);
    rooms.push({
      id: depth * 1000 + idx + 1,
      floorId: depth,
      idx,
      name: roomName(rng),
      x,
      y,
      w,
      h,
      cx: x + (w >> 1),
      cy: y + (h >> 1),
      state: 'stocked',
      lootCp: 0,
      trapTier: 0,
      trapState: 'none',
      restockDueTick: 0,
      visits: 0,
      deaths: 0,
    });
    bySlot.set(`${slot.col},${slot.row}`, idx);
  });

  const adjacency: number[][] = rooms.map(() => []);
  const linked = new Set<string>();
  const link = (a: number, b: number): void => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (linked.has(key) || a === b) return;
    linked.add(key);
    adjacency[a]?.push(b);
    adjacency[b]?.push(a);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const ra = rooms[lo];
    const rb = rooms[hi];
    if (ra && rb) carveCorridor(tiles, ra.cx, ra.cy, rb.cx, rb.cy, corridorHorizontalFirst(lo, hi));
  };

  chosen.forEach((slot, idx) => {
    const east = bySlot.get(`${slot.col + 1},${slot.row}`);
    const south = bySlot.get(`${slot.col},${slot.row + 1}`);
    if (east !== undefined) link(idx, east);
    if (south !== undefined) link(idx, south);
  });

  for (let i = 0; i < rooms.length; i++) {
    if ((adjacency[i]?.length ?? 0) === 0) {
      const target = i === 0 ? Math.min(1, rooms.length - 1) : i - 1;
      link(i, target);
    }
  }

  const extraEdges = Math.round(rooms.length * 0.4);
  for (let i = 0; i < extraEdges; i++) {
    const a = rng.int(0, rooms.length - 1);
    const b = rng.int(0, rooms.length - 1);
    if (a !== b) link(a, b);
  }

  const apsp = buildApsp(adjacency);
  const entryRoom = 0;
  let stairsRoom = rooms.length - 1;
  let best = -1;
  for (let i = 0; i < rooms.length; i++) {
    const d = apsp.dist[entryRoom * rooms.length + i] ?? 0;
    if (d !== 255 && d > best) {
      best = d;
      stairsRoom = i;
    }
  }

  const stairs = rooms[stairsRoom];
  if (stairs) tiles[stairs.cy * FLOOR_WIDTH + stairs.cx] = TILE_STAIRS;
  const entry = rooms[entryRoom];
  if (entry) tiles[entry.cy * FLOOR_WIDTH + entry.cx] = TILE_DOOR;

  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    if (!room || !rng.chance(0.25)) continue;
    const rx = room.x + rng.int(0, room.w - 1);
    const ry = room.y + rng.int(0, room.h - 1);
    if (tiles[ry * FLOOR_WIDTH + rx] === TILE_FLOOR) tiles[ry * FLOOR_WIDTH + rx] = TILE_RUBBLE;
  }

  return {
    id: depth,
    depth,
    name: FLOOR_NAMES[depth - 1] ?? `Sub-level ${depth}`,
    width: FLOOR_WIDTH,
    height: FLOOR_HEIGHT,
    tiles,
    rooms,
    adjacency,
    nextHop: apsp.nextHop,
    dist: apsp.dist,
    entryRoom,
    stairsRoom,
    dangerCr: 1 + Math.round(1.3 * (depth - 1) * 10) / 10,
    generatedTick: tick,
  };
}

export function tilePath(floor: Floor, from: number, to: number): Array<[number, number]> {
  const a = floor.rooms[from];
  const b = floor.rooms[to];
  if (!a || !b) return [];
  const path: Array<[number, number]> = [];
  let x = a.cx;
  let y = a.cy;
  const horizontalFirst = corridorHorizontalFirst(from, to);

  const walkX = (tx: number): void => {
    while (x !== tx) {
      x += x < tx ? 1 : -1;
      path.push([x, y]);
    }
  };
  const walkY = (ty: number): void => {
    while (y !== ty) {
      y += y < ty ? 1 : -1;
      path.push([x, y]);
    }
  };

  if (horizontalFirst) {
    walkX(b.cx);
    walkY(b.cy);
  } else {
    walkY(b.cy);
    walkX(b.cx);
  }
  return path;
}
