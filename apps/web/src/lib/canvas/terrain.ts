import type { FloorMapDTO } from '@donjon/shared';
import { MAP_PALETTE, mixColor } from '../design/teams.js';

export const TILE_WALL = 0;
export const TILE_FLOOR = 1;
export const TILE_DOOR = 2;
export const TILE_STAIRS = 3;
export const TILE_RUBBLE = 4;
export const TILE_HEARTH = 5;
export const TILE_SHOP = 6;

export const CACHE_TILE = 24;
const ROCK_DEPTH = 3;

const ROCK = [MAP_PALETTE.wallFace, MAP_PALETTE.wallMid, MAP_PALETTE.wallDeep];

export function decodeTiles(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function rockDepth(tiles: Uint8Array, w: number, h: number): Uint8Array {
  const depth = new Uint8Array(w * h).fill(255);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < w * h; i++) {
    if ((tiles[i] ?? TILE_WALL) !== TILE_WALL) {
      depth[i] = 0;
      queue[tail++] = i;
    }
  }

  while (head < tail) {
    const i = queue[head++] ?? 0;
    const d = depth[i] ?? 0;
    if (d >= ROCK_DEPTH) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if ((depth[ni] ?? 255) <= d + 1) continue;
        depth[ni] = d + 1;
        queue[tail++] = ni;
      }
    }
  }

  return depth;
}

function paintMasonry(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number): void {
  const px = x * CACHE_TILE;
  const py = y * CACHE_TILE;
  const course = CACHE_TILE / 2;
  ctx.fillStyle = `rgba(6, 5, 4, ${alpha})`;
  ctx.fillRect(px, py, CACHE_TILE, 1.5);
  ctx.fillRect(px, py + course, CACHE_TILE, 1.5);
  const shift = y % 2 === 0 ? 0 : course;
  ctx.fillRect(px + shift, py + 1.5, 1.5, course - 1.5);
  ctx.fillRect(px + (course - shift), py + course + 1.5, 1.5, course - 1.5);

  ctx.fillStyle = `rgba(255, 236, 198, ${alpha * 0.14})`;
  ctx.fillRect(px, py + 1.5, CACHE_TILE, 1);
  ctx.fillRect(px, py + course + 1.5, CACHE_TILE, 1);
}

function paintFloorTile(ctx: CanvasRenderingContext2D, x: number, y: number, tile: number): void {
  const px = x * CACHE_TILE;
  const py = y * CACHE_TILE;

  let colour: string = MAP_PALETTE.floor;
  if (tile === TILE_STAIRS) colour = MAP_PALETTE.stairs;
  else if (tile === TILE_DOOR) colour = MAP_PALETTE.door;
  else if (tile === TILE_RUBBLE) colour = MAP_PALETTE.rubble;
  else if ((x + y) % 4 === 0) colour = MAP_PALETTE.floorAlt;
  ctx.fillStyle = colour;
  ctx.fillRect(px, py, CACHE_TILE, CACHE_TILE);

  if (tile === TILE_RUBBLE) {
    const n = hash2(x, y);
    ctx.fillStyle = 'rgba(12, 10, 8, 0.55)';
    for (let s = 0; s < 4; s++) {
      const rx = px + CACHE_TILE * (0.14 + ((n * (s + 3)) % 1) * 0.66);
      const ry = py + CACHE_TILE * (0.14 + ((n * (s + 7)) % 1) * 0.66);
      ctx.fillRect(rx, ry, 3, 2.5);
    }
    return;
  }

  if (tile === TILE_FLOOR) {
    const n = hash2(x, y);
    ctx.fillStyle = n > 0.5 ? 'rgba(255, 240, 210, 0.022)' : 'rgba(5, 4, 3, 0.05)';
    ctx.fillRect(px, py, CACHE_TILE, CACHE_TILE);
    if (n > 0.93) {
      ctx.fillStyle = 'rgba(74, 66, 52, 0.5)';
      ctx.fillRect(px + CACHE_TILE * 0.35, py + CACHE_TILE * 0.4, 3, 3);
    }
    return;
  }

  if (tile === TILE_STAIRS) {
    ctx.fillStyle = MAP_PALETTE.stairsInk;
    for (let s = 1; s < 4; s++) {
      ctx.fillRect(px + 2, py + (CACHE_TILE / 4) * s, CACHE_TILE - 4, 1.5);
    }
    return;
  }

  if (tile === TILE_SHOP) {
    ctx.fillStyle = 'rgba(38, 30, 22, 0.9)';
    ctx.fillRect(px + 2, py + CACHE_TILE * 0.5, CACHE_TILE - 4, CACHE_TILE * 0.42);
    ctx.fillStyle = 'rgba(120, 176, 156, 0.92)';
    for (let s = 0; s < 3; s++) {
      ctx.fillRect(px + 2 + s * ((CACHE_TILE - 4) / 3), py + CACHE_TILE * 0.26, (CACHE_TILE - 6) / 3, CACHE_TILE * 0.2);
    }
    ctx.fillStyle = 'rgba(226, 208, 168, 0.85)';
    ctx.fillRect(px + 2, py + CACHE_TILE * 0.46, CACHE_TILE - 4, 2);
    return;
  }

  if (tile === TILE_HEARTH) {
    ctx.fillStyle = 'rgba(28, 20, 14, 0.85)';
    ctx.fillRect(px + 2, py + CACHE_TILE * 0.55, CACHE_TILE - 4, CACHE_TILE * 0.4);
    ctx.fillStyle = 'rgba(228, 118, 42, 0.9)';
    ctx.beginPath();
    ctx.moveTo(px + CACHE_TILE / 2, py + CACHE_TILE * 0.18);
    ctx.lineTo(px + CACHE_TILE * 0.78, py + CACHE_TILE * 0.66);
    ctx.lineTo(px + CACHE_TILE * 0.22, py + CACHE_TILE * 0.66);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 214, 120, 0.95)';
    ctx.beginPath();
    ctx.moveTo(px + CACHE_TILE / 2, py + CACHE_TILE * 0.36);
    ctx.lineTo(px + CACHE_TILE * 0.64, py + CACHE_TILE * 0.66);
    ctx.lineTo(px + CACHE_TILE * 0.36, py + CACHE_TILE * 0.66);
    ctx.closePath();
    ctx.fill();
    return;
  }

  ctx.strokeStyle = MAP_PALETTE.doorFrame;
  ctx.lineWidth = 2;
  ctx.strokeRect(px + 1, py + 1, CACHE_TILE - 2, CACHE_TILE - 2);
  ctx.fillStyle = MAP_PALETTE.doorFrame;
  ctx.fillRect(px + CACHE_TILE / 2 - 1, py + 3, 2, CACHE_TILE - 6);
}

export function rasteriseTerrain(map: FloorMapDTO, tiles: Uint8Array): HTMLCanvasElement | null {
  const w = map.width;
  const h = map.height;
  const off = document.createElement('canvas');
  off.width = w * CACHE_TILE;
  off.height = h * CACHE_TILE;
  const ctx = off.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = MAP_PALETTE.unexplored;
  ctx.fillRect(0, 0, off.width, off.height);

  const depth = rockDepth(tiles, w, h);
  const isWall = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= w || y >= h) return true;
    return (tiles[y * w + x] ?? TILE_WALL) === TILE_WALL;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if ((tiles[i] ?? TILE_WALL) !== TILE_WALL) continue;
      const d = depth[i] ?? 255;
      if (d === 0 || d > ROCK_DEPTH) continue;
      const base = ROCK[d - 1] ?? MAP_PALETTE.wallDeep;
      const n = hash2(x, y);
      const grain = d === 1 ? 0.09 : 0.04;
      ctx.fillStyle = mixColor(base, n > 0.5 ? MAP_PALETTE.wallLip : MAP_PALETTE.wallInk, n * grain);
      ctx.fillRect(x * CACHE_TILE, y * CACHE_TILE, CACHE_TILE, CACHE_TILE);
      if (d <= 2) paintMasonry(ctx, x, y, d === 1 ? 0.62 : 0.32);
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = tiles[y * w + x] ?? TILE_WALL;
      if (tile === TILE_WALL) continue;
      paintFloorTile(ctx, x, y, tile);
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = tiles[y * w + x] ?? TILE_WALL;
      if (tile === TILE_WALL) continue;
      const px = x * CACHE_TILE;
      const py = y * CACHE_TILE;
      const left = isWall(x - 1, y);
      const right = isWall(x + 1, y);
      const up = isWall(x, y - 1);
      const down = isWall(x, y + 1);
      const enclosed = (left ? 1 : 0) + (right ? 1 : 0) + (up ? 1 : 0) + (down ? 1 : 0);
      if (enclosed === 0) continue;
      if (enclosed >= 3) continue;

      const narrow = enclosed === 2;
      ctx.fillStyle = MAP_PALETTE.wallShade;
      const deep = Math.round(CACHE_TILE * (narrow ? 0.12 : 0.28));
      const soft = Math.round(CACHE_TILE * (narrow ? 0.07 : 0.13));
      ctx.globalAlpha = narrow ? 0.18 : 0.4;
      if (up) ctx.fillRect(px, py, CACHE_TILE, deep);
      if (left) ctx.fillRect(px, py, soft, CACHE_TILE);
      if (right) ctx.fillRect(px + CACHE_TILE - soft, py, soft, CACHE_TILE);
      if (down) ctx.fillRect(px, py + CACHE_TILE - soft, CACHE_TILE, soft);
      ctx.globalAlpha = 1;
    }
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = MAP_PALETTE.wallInk;
  ctx.beginPath();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = tiles[y * w + x] ?? TILE_WALL;
      if (tile === TILE_WALL) continue;
      const px = x * CACHE_TILE;
      const py = y * CACHE_TILE;
      if (isWall(x - 1, y)) {
        ctx.moveTo(px + 1, py);
        ctx.lineTo(px + 1, py + CACHE_TILE);
      }
      if (isWall(x + 1, y)) {
        ctx.moveTo(px + CACHE_TILE - 1, py);
        ctx.lineTo(px + CACHE_TILE - 1, py + CACHE_TILE);
      }
      if (isWall(x, y - 1)) {
        ctx.moveTo(px, py + 1);
        ctx.lineTo(px + CACHE_TILE, py + 1);
      }
      if (isWall(x, y + 1)) {
        ctx.moveTo(px, py + CACHE_TILE - 1);
        ctx.lineTo(px + CACHE_TILE, py + CACHE_TILE - 1);
      }
    }
  }
  ctx.stroke();

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 232, 186, 0.2)';
  ctx.beginPath();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if ((tiles[i] ?? TILE_WALL) !== TILE_WALL) continue;
      if ((depth[i] ?? 255) !== 1) continue;
      const px = x * CACHE_TILE;
      const py = y * CACHE_TILE;
      if (!isWall(x, y + 1)) {
        ctx.moveTo(px, py + CACHE_TILE - 1);
        ctx.lineTo(px + CACHE_TILE, py + CACHE_TILE - 1);
      }
    }
  }
  ctx.stroke();

  return off;
}
