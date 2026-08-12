import type { FloorMapDTO, MonsterPublic, TokenPublic } from '@donjon/shared';
import { MAP_PALETTE, teamColor, teamShape, type TokenShape } from '../design/teams.js';
import { onFloor } from '../floorview.js';

export const TILE_WALL = 0;
export const TILE_FLOOR = 1;
export const TILE_DOOR = 2;
export const TILE_STAIRS = 3;

const CACHE_TILE = 24;
const TORCH_TILES = 6.5;

export interface Camera {
  zoom: number;
  panX: number;
  panY: number;
}

function decodeTiles(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: TokenShape,
  x: number,
  y: number,
  r: number,
): void {
  ctx.beginPath();
  switch (shape) {
    case 'diamond':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case 'square':
      ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
      break;
    case 'triangle-up':
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.75);
      ctx.lineTo(x - r, y + r * 0.75);
      ctx.closePath();
      break;
    case 'triangle-down':
      ctx.moveTo(x, y + r);
      ctx.lineTo(x + r, y - r * 0.75);
      ctx.lineTo(x - r, y - r * 0.75);
      ctx.closePath();
      break;
    case 'hexagon': {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const px = x + r * Math.cos(a);
        const py = y + r * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

export class MapRenderer {
  private terrain: HTMLCanvasElement | null = null;
  private terrainKey = '';
  private raf = 0;
  private map: FloorMapDTO | null = null;
  private allTokens: TokenPublic[] = [];
  private allMonsters: MonsterPublic[] = [];
  private tokens: TokenPublic[] = [];
  private monsters: MonsterPublic[] = [];
  private dpr = 1;

  readonly camera: Camera = { zoom: 1, panX: 0, panY: 0 };
  lastFrameMs = 0;

  private positionSource: ((id: number, fx: number, fy: number) => { x: number; y: number }) | null = null;
  private fogRooms: Set<number> | null = null;
  private sightRooms: Set<number> | null = null;
  private focusTokenId: number | null = null;
  private fogLayer: HTMLCanvasElement | null = null;
  private fogMask: HTMLCanvasElement | null = null;
  private fogMaskKey = '';
  private fogSeeded = false;
  private seenTiles: Uint8Array | null = null;

  setFog(
    rooms: Set<number> | null,
    sight: Set<number> | null,
    focusTokenId: number | null,
    seenTiles: Uint8Array | null = null,
  ): void {
    this.fogRooms = rooms;
    this.sightRooms = sight;
    this.focusTokenId = focusTokenId;
    if (seenTiles !== this.seenTiles) {
      this.seenTiles = seenTiles;
      this.fogSeeded = false;
    }
  }

  constructor(private readonly canvas: HTMLCanvasElement) {}

  setPositionSource(
    source: ((id: number, fx: number, fy: number) => { x: number; y: number }) | null,
  ): void {
    this.positionSource = source;
  }

  setMap(map: FloorMapDTO): void {
    this.map = map;
    const key = `${map.id}:${map.width}x${map.height}`;
    if (key !== this.terrainKey) {
      this.terrainKey = key;
      this.rasteriseTerrain(map);
    }
    this.reslice();
  }

  setTokens(tokens: TokenPublic[]): void {
    this.allTokens = tokens;
    this.reslice();
  }

  setMonsters(monsters: MonsterPublic[]): void {
    this.allMonsters = monsters;
    this.reslice();
  }

  private reslice(): void {
    const floorId = this.map?.id ?? null;
    this.tokens = onFloor(this.allTokens, floorId);
    this.monsters = onFloor(this.allMonsters, floorId);
  }

  private focusPosition(): { x: number; y: number } | null {
    if (this.focusTokenId === null) return null;
    const token = this.tokens.find((t) => t.id === this.focusTokenId);
    if (!token) return null;
    return this.positionSource
      ? this.positionSource(token.id, token.x, token.y)
      : { x: token.x, y: token.y };
  }

  private rasteriseTerrain(map: FloorMapDTO): void {
    const off = document.createElement('canvas');
    off.width = map.width * CACHE_TILE;
    off.height = map.height * CACHE_TILE;
    const ctx = off.getContext('2d');
    if (!ctx) return;

    const tiles = decodeTiles(map.tiles);
    ctx.fillStyle = MAP_PALETTE.unexplored;
    ctx.fillRect(0, 0, off.width, off.height);

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = tiles[y * map.width + x] ?? TILE_WALL;
        if (tile === TILE_WALL) continue;
        let colour: string = MAP_PALETTE.floor;
        if (tile === TILE_STAIRS) colour = MAP_PALETTE.stairs;
        else if (tile === TILE_DOOR) colour = MAP_PALETTE.door;
        else if ((x + y) % 4 === 0) colour = MAP_PALETTE.floorAlt;
        ctx.fillStyle = colour;
        ctx.fillRect(x * CACHE_TILE, y * CACHE_TILE, CACHE_TILE, CACHE_TILE);
      }
    }

    ctx.strokeStyle = MAP_PALETTE.wallInk;
    ctx.lineWidth = 2;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = tiles[y * map.width + x] ?? TILE_WALL;
        if (tile === TILE_WALL) continue;
        const left = x === 0 || (tiles[y * map.width + x - 1] ?? TILE_WALL) === TILE_WALL;
        const right = x + 1 >= map.width || (tiles[y * map.width + x + 1] ?? TILE_WALL) === TILE_WALL;
        const up = y === 0 || (tiles[(y - 1) * map.width + x] ?? TILE_WALL) === TILE_WALL;
        const down = y + 1 >= map.height || (tiles[(y + 1) * map.width + x] ?? TILE_WALL) === TILE_WALL;
        const px = x * CACHE_TILE;
        const py = y * CACHE_TILE;
        ctx.beginPath();
        if (left) {
          ctx.moveTo(px, py);
          ctx.lineTo(px, py + CACHE_TILE);
        }
        if (right) {
          ctx.moveTo(px + CACHE_TILE, py);
          ctx.lineTo(px + CACHE_TILE, py + CACHE_TILE);
        }
        if (up) {
          ctx.moveTo(px, py);
          ctx.lineTo(px + CACHE_TILE, py);
        }
        if (down) {
          ctx.moveTo(px, py + CACHE_TILE);
          ctx.lineTo(px + CACHE_TILE, py + CACHE_TILE);
        }
        ctx.stroke();
      }
    }

    this.terrain = off;
  }

  private fit(): { scale: number; offsetX: number; offsetY: number } {
    const map = this.map;
    const terrain = this.terrain;
    if (!map || !terrain) return { scale: 1, offsetX: 0, offsetY: 0 };
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const base = Math.min(cw / terrain.width, ch / terrain.height);
    const scale = base * this.camera.zoom;
    const offsetX = (cw - terrain.width * scale) / 2 + this.camera.panX;
    const offsetY = (ch - terrain.height * scale) / 2 + this.camera.panY;
    return { scale, offsetX, offsetY };
  }

  draw(): void {
    const started = performance.now();
    const ctx = this.canvas.getContext('2d');
    const map = this.map;
    const terrain = this.terrain;
    if (!ctx || !map || !terrain) return;

    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(cw * this.dpr) || this.canvas.height !== Math.round(ch * this.dpr)) {
      this.canvas.width = Math.round(cw * this.dpr);
      this.canvas.height = Math.round(ch * this.dpr);
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = MAP_PALETTE.unexplored;
    ctx.fillRect(0, 0, cw, ch);

    const { scale, offsetX, offsetY } = this.fit();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(terrain, offsetX, offsetY, terrain.width * scale, terrain.height * scale);

    if (this.fogRooms) {
      const key = `${map.id}:${this.focusTokenId ?? 0}`;
      let mask = this.fogMask;

      if (!mask || this.fogMaskKey !== key || mask.width !== map.width || mask.height !== map.height) {
        mask = this.fogMask = document.createElement('canvas');
        mask.width = map.width;
        mask.height = map.height;
        this.fogMaskKey = key;
        const mctx = mask.getContext('2d');
        if (mctx) {
          mctx.fillStyle = '#000';
          mctx.fillRect(0, 0, map.width, map.height);
        }
        this.fogSeeded = false;
      }

      const mctx = mask.getContext('2d');
      if (mctx) {
        mctx.globalCompositeOperation = 'destination-out';

        if (!this.fogSeeded) {
          mctx.fillStyle = 'rgba(0,0,0,0.85)';
          for (const idx of this.fogRooms) {
            const room = map.rooms[idx];
            if (!room) continue;
            mctx.fillRect(room.x - 1, room.y - 1, room.w + 2, room.h + 2);
          }

          if (this.seenTiles) {
            for (let y = 0; y < map.height; y++) {
              for (let x = 0; x < map.width; x++) {
                const i = y * map.width + x;
                if (((this.seenTiles[i >> 3] ?? 0) & (1 << (i & 7))) === 0) continue;
                mctx.fillRect(x, y, 1, 1);
              }
            }
          }
          this.fogSeeded = true;
        }

        for (const token of this.tokens) {
          if (this.focusTokenId !== null && token.id !== this.focusTokenId) continue;
          const pos = this.positionSource
            ? this.positionSource(token.id, token.x, token.y)
            : { x: token.x, y: token.y };
          const grad = mctx.createRadialGradient(pos.x + 0.5, pos.y + 0.5, 0, pos.x + 0.5, pos.y + 0.5, TORCH_TILES);
          grad.addColorStop(0, 'rgba(0,0,0,1)');
          grad.addColorStop(0.6, 'rgba(0,0,0,1)');
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          mctx.fillStyle = grad;
          mctx.beginPath();
          mctx.arc(pos.x + 0.5, pos.y + 0.5, TORCH_TILES, 0, Math.PI * 2);
          mctx.fill();
        }

        mctx.globalCompositeOperation = 'source-over';
      }

      ctx.save();
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(mask, offsetX, offsetY, terrain.width * scale, terrain.height * scale);
      ctx.restore();
    } else {
      this.fogMask = null;
      this.fogMaskKey = '';
    }

    const tilePx = CACHE_TILE * scale;
    const radius = Math.max(5, tilePx * 0.42);

    const focus = this.focusPosition();

    const isSeen = (x: number, y: number): boolean => {
      if (!this.fogRooms) return true;
      if (focus) {
        const dx = x - focus.x;
        const dy = y - focus.y;
        if (dx * dx + dy * dy <= TORCH_TILES * TORCH_TILES) return true;
      }
      if (!this.seenTiles || !map) return false;
      const i = y * map.width + x;
      return ((this.seenTiles[i >> 3] ?? 0) & (1 << (i & 7))) !== 0;
    };

    for (const monster of this.monsters) {
      if (!isSeen(monster.x, monster.y)) continue;
      const mx = offsetX + (monster.x + 0.5) * tilePx;
      const my = offsetY + (monster.y + 0.5) * tilePx;
      if (mx < -tilePx || my < -tilePx || mx > cw + tilePx || my > ch + tilePx) continue;

      const r = Math.max(4, radius * (monster.guardian ? 0.85 : 0.62));
      ctx.beginPath();
      ctx.moveTo(mx, my - r);
      ctx.lineTo(mx + r, my);
      ctx.lineTo(mx, my + r);
      ctx.lineTo(mx - r, my);
      ctx.closePath();
      ctx.fillStyle = monster.guardian ? '#B892F1' : '#E64F3E';
      ctx.fill();
      ctx.strokeStyle = '#050403';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (monster.guardian && r >= 5) {
        ctx.beginPath();
        ctx.arc(mx, my, r * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(184, 146, 241, 0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    ctx.lineWidth = 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.max(8, Math.round(radius * 0.85))}px ui-sans-serif, system-ui, sans-serif`;

    for (const token of this.tokens) {
      const pos = this.positionSource
        ? this.positionSource(token.id, token.x, token.y)
        : { x: token.x, y: token.y };
      const cx = offsetX + (pos.x + 0.5) * tilePx;
      const cy = offsetY + (pos.y + 0.5) * tilePx;
      if (cx < -tilePx || cy < -tilePx || cx > cw + tilePx || cy > ch + tilePx) continue;

      const dimmed = this.focusTokenId !== null && token.id !== this.focusTokenId;
      if (dimmed && !isSeen(Math.round(pos.x), Math.round(pos.y))) continue;
      ctx.globalAlpha = dimmed ? 0.55 : 1;

      if (this.focusTokenId === token.id) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 2.1, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFBE4D';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 2;
      }

      ctx.fillStyle = teamColor(token.colorIndex);
      ctx.strokeStyle = '#050403';
      drawShape(ctx, teamShape(token.colorIndex), cx, cy, radius);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (radius >= 9) {
        ctx.fillStyle = '#050403';
        ctx.fillText(token.monogram, cx, cy + 0.5);
      }
    }

    this.lastFrameMs = performance.now() - started;
  }

  start(): void {
    const tick = (): void => {
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.terrain) {
      this.terrain.width = 0;
      this.terrain = null;
    }
    if (this.fogLayer) {
      this.fogLayer.width = 0;
      this.fogLayer = null;
    }
    if (this.fogMask) {
      this.fogMask.width = 0;
      this.fogMask = null;
      this.fogMaskKey = '';
    }
  }
}
