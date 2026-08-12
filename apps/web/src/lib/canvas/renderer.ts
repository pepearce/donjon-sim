import { forEachVisible, hasLineOfSight, type FloorMapDTO, type HeroPublic, type MonsterPublic, type TokenPublic } from '@donjon/shared';
import type { FxEvent } from '../applyFrame.js';
import { FX_PALETTE, MAP_PALETTE, mixColor, teamColor, teamShape, withAlpha, type TokenShape } from '../design/teams.js';
import { onFloor } from '../floorview.js';
import type { DramaBeat } from './fx.js';
import { FxLayer, type FxAnchor } from './fx.js';
import { CACHE_TILE, TILE_DOOR, TILE_FLOOR, TILE_STAIRS, TILE_WALL, decodeTiles, rasteriseTerrain } from './terrain.js';

export { CACHE_TILE, TILE_DOOR, TILE_FLOOR, TILE_STAIRS, TILE_WALL };

const TORCH_TILES = 6.5;
const FOG_SCALE = 4;
const UNFOLD_TILE_PX = 26;
const MONSTER_LABEL_TILE_PX = 22;

const CLASS_GLYPHS: Record<string, string> = {
  sabreur: '/',
  bruiser: '#',
  cutpurse: '$',
  sapper: '^',
  thaumaturge: '*',
  pretre: '+',
};
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 9;
const FOLLOW_ZOOM = 2.6;
const ZOOM_TAU = 130;
const PAN_TAU = 210;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export interface Camera {
  zoom: number;
  panX: number;
  panY: number;
}

function torchAlpha(dist: number): number {
  const t = Math.min(1, dist / TORCH_TILES);
  if (t <= 0.55) return 1;
  return Math.max(0, 1 - (t - 0.55) / 0.45);
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
  private rosters = new Map<number, HeroPublic[]>();
  private dpr = 1;

  readonly camera: Camera = { zoom: 1, panX: 0, panY: 0 };
  lastFrameMs = 0;

  private readonly fxLayer = new FxLayer();
  private fxQueue: FxEvent[] | null = null;
  private reduced = false;
  private followEnabled = false;
  private desiredZoom = 1;
  private lastTs = 0;

  private positionSource: ((id: number, fx: number, fy: number) => { x: number; y: number }) | null = null;
  private fogRooms: Set<number> | null = null;
  private sightRooms: Set<number> | null = null;
  private focusTokenId: number | null = null;
  private fogMask: HTMLCanvasElement | null = null;
  private fogMaskKey = '';
  private fogSeeded = false;
  private seenTiles: Uint8Array | null = null;
  private mapTiles: Uint8Array | null = null;

  private readonly wallProbe =
    typeof location !== 'undefined' && location.search.includes('wallcheck');
  private readonly probed = new Map<number, string>();

  constructor(private readonly canvas: HTMLCanvasElement) {}

  private probeWall(map: FloorMapDTO, token: TokenPublic, pos: { x: number; y: number }): void {
    const tiles = this.mapTiles;
    if (!tiles) return;
    const at = (x: number, y: number): number => {
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix < 0 || iy < 0 || ix >= map.width || iy >= map.height) return TILE_WALL;
      return tiles[iy * map.width + ix] ?? TILE_WALL;
    };
    const drawn = at(pos.x, pos.y);
    const raw = at(token.x, token.y);
    const key = `${drawn === TILE_WALL ? 1 : 0}${raw === TILE_WALL ? 1 : 0}`;
    if (this.probed.get(token.id) === key) return;
    this.probed.set(token.id, key);
    if (drawn !== TILE_WALL && raw !== TILE_WALL) return;
    console.warn(
      `[wallcheck] token=${token.id} token.floorId=${token.floorId} map.id=${map.id} ` +
        `drawn=(${pos.x.toFixed(2)},${pos.y.toFixed(2)}) tile=${drawn} ` +
        `raw=(${token.x},${token.y}) tile=${raw} ` +
        `interp=${this.positionSource ? 'on' : 'off'} tiles=${tiles.length} wh=${map.width}x${map.height}`,
    );
  }

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

  setPositionSource(
    source: ((id: number, fx: number, fy: number) => { x: number; y: number }) | null,
  ): void {
    this.positionSource = source;
  }

  setFxQueue(queue: FxEvent[] | null): void {
    this.fxQueue = queue;
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
  }

  setFollow(on: boolean): void {
    if (on && !this.followEnabled && this.camera.zoom < FOLLOW_ZOOM) {
      this.desiredZoom = FOLLOW_ZOOM;
    }
    this.followEnabled = on;
  }

  dramaSince(cutoff: number): DramaBeat[] {
    return this.fxLayer.dramaSince(cutoff);
  }

  setMap(map: FloorMapDTO): void {
    this.map = map;
    this.mapTiles = decodeTiles(map.tiles);
    const key = `${map.id}:${map.width}x${map.height}:${map.tiles}`;
    if (key !== this.terrainKey) {
      this.terrainKey = key;
      this.terrain = rasteriseTerrain(map, this.mapTiles);
      this.fxLayer.clearParticles();
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

  setRosters(rosters: Map<number, HeroPublic[]>): void {
    this.rosters = rosters;
  }

  private reslice(): void {
    const floorId = this.map?.id ?? null;
    this.tokens = onFloor(this.allTokens, floorId);
    this.monsters = onFloor(this.allMonsters, floorId);
  }

  private tokenPosition(token: TokenPublic): { x: number; y: number } {
    return this.positionSource
      ? this.positionSource(token.id, token.x, token.y)
      : { x: token.x, y: token.y };
  }

  private focusPosition(): { x: number; y: number } | null {
    if (this.focusTokenId === null) return null;
    const token = this.tokens.find((t) => t.id === this.focusTokenId);
    if (!token) return null;
    return this.tokenPosition(token);
  }

  private baseScale(cw: number, ch: number): number {
    const terrain = this.terrain;
    if (!terrain || terrain.width === 0 || terrain.height === 0) return 1;
    return Math.min(cw / terrain.width, ch / terrain.height);
  }

  private clampPan(cw: number, ch: number): void {
    const terrain = this.terrain;
    if (!terrain) return;
    const scale = this.baseScale(cw, ch) * this.camera.zoom;
    const mx = Math.max(0, (terrain.width * scale - cw) / 2) + cw * 0.35;
    const my = Math.max(0, (terrain.height * scale - ch) / 2) + ch * 0.35;
    this.camera.panX = Math.max(-mx, Math.min(mx, this.camera.panX));
    this.camera.panY = Math.max(-my, Math.min(my, this.camera.panY));
  }

  zoomAt(px: number, py: number, factor: number): void {
    const terrain = this.terrain;
    if (!terrain) return;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const base = this.baseScale(cw, ch);
    const z0 = this.camera.zoom;
    const z1 = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z0 * factor));
    if (Math.abs(z1 - z0) < 1e-4) return;
    const s0 = base * z0;
    const s1 = base * z1;
    const wx = (px - ((cw - terrain.width * s0) / 2 + this.camera.panX)) / s0;
    const wy = (py - ((ch - terrain.height * s0) / 2 + this.camera.panY)) / s0;
    this.camera.zoom = z1;
    this.desiredZoom = z1;
    this.camera.panX = px - wx * s1 - (cw - terrain.width * s1) / 2;
    this.camera.panY = py - wy * s1 - (ch - terrain.height * s1) / 2;
    this.clampPan(cw, ch);
  }

  panBy(dx: number, dy: number): void {
    this.camera.panX += dx;
    this.camera.panY += dy;
    this.clampPan(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  resetView(): void {
    this.camera.zoom = 1;
    this.camera.panX = 0;
    this.camera.panY = 0;
    this.desiredZoom = 1;
  }

  get zoom(): number {
    return this.camera.zoom;
  }

  get particleCount(): number {
    return this.fxLayer.particleCount;
  }

  private updateCamera(cw: number, ch: number, dtMs: number): void {
    const terrain = this.terrain;
    if (!terrain) return;

    if (Math.abs(this.desiredZoom - this.camera.zoom) > 0.001) {
      const k = this.reduced ? 1 : 1 - Math.exp(-dtMs / ZOOM_TAU);
      this.camera.zoom += (this.desiredZoom - this.camera.zoom) * k;
    } else {
      this.camera.zoom = this.desiredZoom;
    }

    if (!this.followEnabled) return;
    const focus = this.focusPosition();
    if (!focus) return;

    const scale = this.baseScale(cw, ch) * this.camera.zoom;
    const tilePx = CACHE_TILE * scale;
    const wantX = cw / 2 - (focus.x + 0.5) * tilePx - (cw - terrain.width * scale) / 2;
    const wantY = ch / 2 - (focus.y + 0.5) * tilePx - (ch - terrain.height * scale) / 2;
    const k = this.reduced ? 1 : 1 - Math.exp(-dtMs / PAN_TAU);
    this.camera.panX += (wantX - this.camera.panX) * k;
    this.camera.panY += (wantY - this.camera.panY) * k;
    this.clampPan(cw, ch);
  }

  private fit(): { scale: number; offsetX: number; offsetY: number } {
    const map = this.map;
    const terrain = this.terrain;
    if (!map || !terrain) return { scale: 1, offsetX: 0, offsetY: 0 };
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const scale = this.baseScale(cw, ch) * this.camera.zoom;
    const offsetX = (cw - terrain.width * scale) / 2 + this.camera.panX;
    const offsetY = (ch - terrain.height * scale) / 2 + this.camera.panY;
    return { scale, offsetX, offsetY };
  }

  private resolveFx = (fx: FxEvent): FxAnchor | null => {
    const map = this.map;
    if (!map) return null;
    const preferRoom =
      fx.type === 'ROOM_CLEARED' || fx.type === 'ROOM_LANDMARK' || fx.type === 'RECORD_SET';

    if (!preferRoom && fx.teamId !== null) {
      const token = this.tokens.find((t) => t.id === fx.teamId);
      if (token) {
        const pos = this.tokenPosition(token);
        return { x: pos.x, y: pos.y, w: 1, h: 1, room: false };
      }
    }

    if (fx.roomId !== null) {
      const room = map.rooms.find((r) => r.id === fx.roomId);
      if (room) return { x: room.cx, y: room.cy, w: room.w, h: room.h, room: true };
    }

    if (preferRoom && fx.teamId !== null) {
      const token = this.tokens.find((t) => t.id === fx.teamId);
      if (token) {
        const pos = this.tokenPosition(token);
        return { x: pos.x, y: pos.y, w: 1, h: 1, room: false };
      }
    }

    return null;
  };

  private paintFog(
    ctx: CanvasRenderingContext2D,
    map: FloorMapDTO,
    offsetX: number,
    offsetY: number,
    drawW: number,
    drawH: number,
  ): void {
    if (!this.fogRooms) {
      if (this.fogMask) {
        this.fogMask.width = 0;
        this.fogMask = null;
      }
      this.fogMaskKey = '';
      return;
    }

    const mw = map.width * FOG_SCALE;
    const mh = map.height * FOG_SCALE;
    const key = `${map.id}:${this.focusTokenId ?? 0}`;
    let mask = this.fogMask;

    if (!mask || this.fogMaskKey !== key || mask.width !== mw || mask.height !== mh) {
      mask = this.fogMask = document.createElement('canvas');
      mask.width = mw;
      mask.height = mh;
      this.fogMaskKey = key;
      const seed = mask.getContext('2d');
      if (seed) {
        seed.imageSmoothingEnabled = false;
        seed.fillStyle = '#000';
        seed.fillRect(0, 0, mw, mh);
      }
      this.fogSeeded = false;
    }

    const mctx = mask.getContext('2d');
    if (mctx) {
      mctx.imageSmoothingEnabled = false;
      mctx.globalCompositeOperation = 'destination-out';

      if (!this.fogSeeded) {
        mctx.fillStyle = 'rgba(0,0,0,0.85)';
        for (const idx of this.fogRooms) {
          const room = map.rooms[idx];
          if (!room) continue;
          mctx.fillRect(
            (room.x - 1) * FOG_SCALE,
            (room.y - 1) * FOG_SCALE,
            (room.w + 2) * FOG_SCALE,
            (room.h + 2) * FOG_SCALE,
          );
        }

        if (this.seenTiles) {
          for (let y = 0; y < map.height; y++) {
            for (let x = 0; x < map.width; x++) {
              const i = y * map.width + x;
              if (((this.seenTiles[i >> 3] ?? 0) & (1 << (i & 7))) === 0) continue;
              mctx.fillRect(x * FOG_SCALE, y * FOG_SCALE, FOG_SCALE, FOG_SCALE);
            }
          }
        }
        this.fogSeeded = true;
      }

      const tiles = this.mapTiles;
      if (tiles) {
        for (const token of this.tokens) {
          if (this.focusTokenId !== null && token.id !== this.focusTokenId) continue;
          const pos = this.tokenPosition(token);
          const ox = Math.round(pos.x);
          const oy = Math.round(pos.y);
          forEachVisible(tiles, map.width, map.height, ox, oy, TORCH_TILES, (x, y) => {
            const dist = Math.hypot(x - ox, y - oy);
            mctx.fillStyle = `rgba(0,0,0,${torchAlpha(dist)})`;
            mctx.fillRect(x * FOG_SCALE, y * FOG_SCALE, FOG_SCALE, FOG_SCALE);
          });
        }
      }

      mctx.globalCompositeOperation = 'source-over';
    }

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(mask, offsetX, offsetY, drawW, drawH);
    ctx.restore();
  }

  private drawTrails(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, tilePx: number): void {
    if (tilePx < 3.5) return;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, tilePx * 0.16);

    for (const token of this.tokens) {
      const trail = token.trail;
      if (!trail || trail.length < 2) continue;
      const focused = this.focusTokenId === null || this.focusTokenId === token.id;
      if (this.fogRooms && !focused) continue;

      const pos = this.tokenPosition(token);
      const colour = teamColor(token.colorIndex);
      const peak = focused ? 0.42 : 0.18;
      const pts: Array<[number, number]> = [...trail, [pos.x, pos.y]];

      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (!a || !b) continue;
        if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 6) continue;
        ctx.strokeStyle = withAlpha(colour, (i / (pts.length - 1)) * peak);
        ctx.beginPath();
        ctx.moveTo(offsetX + (a[0] + 0.5) * tilePx, offsetY + (a[1] + 0.5) * tilePx);
        ctx.lineTo(offsetX + (b[0] + 0.5) * tilePx, offsetY + (b[1] + 0.5) * tilePx);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawRoomTitles(
    ctx: CanvasRenderingContext2D,
    map: FloorMapDTO,
    offsetX: number,
    offsetY: number,
    tilePx: number,
    cw: number,
    ch: number,
  ): void {
    if (tilePx < 7) return;
    const size = Math.max(9, Math.min(16, tilePx * 0.8));
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.font = `600 ${Math.round(size)}px ${MONO}`;
    ctx.lineWidth = Math.max(2, size * 0.3);
    ctx.strokeStyle = MAP_PALETTE.labelInk;

    const claimed: Array<[number, number, number, number]> = [];
    const order = map.rooms
      .map((room, i) => ({ title: room.title ?? '', deaths: room.deaths ?? 0, room, i }))
      .filter((entry) => entry.title !== '')
      .sort((a, b) => b.deaths - a.deaths);

    for (const { title, deaths, room, i } of order) {
      if (this.fogRooms && !this.fogRooms.has(i)) continue;

      const sx = offsetX + (room.cx + 0.5) * tilePx;
      const inside = room.h >= 3;
      const sy = offsetY + (inside ? room.y + room.h - 0.55 : room.y + room.h + 0.6) * tilePx;
      if (sx < -tilePx * 8 || sy < -tilePx * 4 || sx > cw + tilePx * 8 || sy > ch + tilePx * 4) continue;

      const label = deaths > 0 ? `${title.toUpperCase()} · ${deaths}†` : title.toUpperCase();
      const half = ctx.measureText(label).width / 2 + 3;
      const top = sy - size * 0.75;
      const bottom = sy + size * 0.75;
      if (claimed.some((b) => sx - half < b[2] && sx + half > b[0] && top < b[3] && bottom > b[1])) {
        continue;
      }
      claimed.push([sx - half, top, sx + half, bottom]);

      ctx.strokeText(label, sx, sy);
      ctx.fillStyle = deaths > 0 ? FX_PALETTE.blood : MAP_PALETTE.label;
      ctx.fillText(label, sx, sy);
    }

    ctx.restore();
  }

  private drawMonsters(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    offsetY: number,
    tilePx: number,
    cw: number,
    ch: number,
    radius: number,
    strokeW: number,
    now: number,
    isSeen: (x: number, y: number) => boolean,
  ): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const claimed: Array<[number, number, number, number]> = [];

    for (const monster of this.monsters) {
      if (!isSeen(monster.x, monster.y)) continue;
      const mx = offsetX + (monster.x + 0.5) * tilePx;
      const my = offsetY + (monster.y + 0.5) * tilePx;
      if (mx < -tilePx || my < -tilePx || mx > cw + tilePx || my > ch + tilePx) continue;

      const power = Math.min(1, Math.max(0, monster.cr) / 8);
      const r = Math.max(1.5, radius * (monster.guardian ? 0.95 : 0.5 + power * 0.4));
      const base = monster.guardian ? FX_PALETTE.guardian : FX_PALETTE.monster;
      const fill = mixColor(MAP_PALETTE.wallInk, base, 0.45 + power * 0.55);

      if (monster.guardian) {
        const pulse = this.reduced ? 0.5 : 0.5 + 0.35 * Math.sin(now / 520);
        ctx.strokeStyle = withAlpha(FX_PALETTE.guardian, 0.2 + pulse * 0.4);
        ctx.lineWidth = Math.max(1, strokeW);
        ctx.beginPath();
        ctx.arc(mx, my, r * 1.65, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        for (let s = 0; s < 4; s++) {
          const a = (Math.PI / 2) * s + Math.PI / 4;
          ctx.moveTo(mx + Math.cos(a) * r * 1.2, my + Math.sin(a) * r * 1.2);
          ctx.lineTo(mx + Math.cos(a) * r * 1.9, my + Math.sin(a) * r * 1.9);
        }
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(mx, my - r);
      ctx.lineTo(mx + r, my);
      ctx.lineTo(mx, my + r);
      ctx.lineTo(mx - r, my);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = MAP_PALETTE.wallInk;
      ctx.lineWidth = Math.max(0.75, strokeW * 0.75);
      ctx.stroke();

      if (monster.hp < monster.hpMax && monster.hpMax > 0 && r >= 4) {
        const frac = Math.max(0, monster.hp / monster.hpMax);
        ctx.strokeStyle = withAlpha(FX_PALETTE.blood, 0.9);
        ctx.lineWidth = Math.max(1, strokeW * 0.9);
        ctx.beginPath();
        ctx.arc(mx, my, r * 1.35, -Math.PI * 0.9, -Math.PI * 0.9 + Math.PI * 1.8 * frac);
        ctx.stroke();
      }

      if (r >= 7) {
        ctx.font = `700 ${Math.round(Math.max(8, r * 0.95))}px ${MONO}`;
        ctx.fillStyle = MAP_PALETTE.wallInk;
        ctx.fillText(String(Math.round(monster.cr)), mx, my + 0.5);
      }

      const showLabel = monster.guardian ? tilePx >= 20 : tilePx >= MONSTER_LABEL_TILE_PX;
      if (showLabel) {
        const size = monster.guardian
          ? Math.max(9, tilePx * 0.42)
          : Math.max(8, tilePx * 0.32);
        const ly = my - r * 2.1;
        ctx.font = `600 ${Math.round(size)}px ${MONO}`;
        const half = ctx.measureText(monster.name).width / 2 + 3;
        const top = ly - size * 0.75;
        const bottom = ly + size * 0.75;
        const clash = claimed.some(
          (b) => mx - half < b[2] && mx + half > b[0] && top < b[3] && bottom > b[1],
        );
        if (monster.guardian || !clash) {
          claimed.push([mx - half, top, mx + half, bottom]);
          ctx.lineWidth = Math.max(2, tilePx * 0.12);
          ctx.lineJoin = 'round';
          ctx.strokeStyle = MAP_PALETTE.labelInk;
          ctx.strokeText(monster.name, mx, ly);
          ctx.fillStyle = monster.guardian ? FX_PALETTE.guardian : MAP_PALETTE.label;
          ctx.fillText(monster.name, mx, ly);
        }
      }
    }

    ctx.restore();
  }

  private drawCrew(
    ctx: CanvasRenderingContext2D,
    crew: HeroPublic[],
    token: TokenPublic,
    cx: number,
    cy: number,
    tilePx: number,
    strokeW: number,
  ): void {
    const colour = teamColor(token.colorIndex);
    const front = crew.filter((h) => h.line === 'front' && h.state !== 'dead');
    const back = crew.filter((h) => h.line === 'back' && h.state !== 'dead');
    const rows = [front, back].filter((row) => row.length > 0);
    if (rows.length === 0) return;

    const rp = Math.max(4, tilePx * 0.19);
    const gap = rp * 2.3;
    const rowGap = rp * 2.5;
    const y0 = cy - ((rows.length - 1) / 2) * rowGap;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const py = y0 + r * rowGap;
      const x0 = cx - ((row.length - 1) / 2) * gap;

      for (let i = 0; i < row.length; i++) {
        const hero = row[i];
        if (!hero) continue;
        const px = x0 + i * gap;
        const downed = hero.state === 'downed';

        ctx.beginPath();
        ctx.arc(px, py, rp, 0, Math.PI * 2);
        ctx.fillStyle = downed ? withAlpha(colour, 0.18) : colour;
        ctx.fill();
        ctx.strokeStyle = downed ? FX_PALETTE.blood : MAP_PALETTE.wallInk;
        ctx.lineWidth = Math.max(0.75, strokeW * 0.8);
        ctx.stroke();

        ctx.font = `700 ${Math.round(rp * 1.15)}px ${MONO}`;
        ctx.fillStyle = downed ? FX_PALETTE.blood : MAP_PALETTE.wallInk;
        ctx.fillText(CLASS_GLYPHS[hero.className] ?? '?', px, py + 0.5);

        if (!downed && hero.hp < hero.hpMax && hero.hpMax > 0) {
          const frac = Math.max(0, hero.hp / hero.hpMax);
          ctx.strokeStyle =
            frac > 0.5 ? FX_PALETTE.level : frac > 0.25 ? FX_PALETTE.clash : FX_PALETTE.blood;
          ctx.lineWidth = Math.max(1, strokeW * 0.7);
          ctx.beginPath();
          ctx.arc(px, py, rp * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
          ctx.stroke();
        }
      }
    }

    ctx.font = `700 ${Math.round(Math.max(8, tilePx * 0.28))}px ${MONO}`;
    ctx.lineWidth = Math.max(2, tilePx * 0.08);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = MAP_PALETTE.labelInk;
    const ly = y0 - rowGap * 0.5 - rp * 1.6;
    ctx.strokeText(token.monogram, cx, ly);
    ctx.fillStyle = colour;
    ctx.fillText(token.monogram, cx, ly);
  }

  draw(): void {
    const started = performance.now();
    const dtMs = this.lastTs === 0 ? 16 : Math.min(120, started - this.lastTs);
    this.lastTs = started;

    if (this.fxQueue) this.fxLayer.ingest(this.fxQueue, this.resolveFx, started, this.reduced);

    const ctx = this.canvas.getContext('2d');
    const map = this.map;
    const terrain = this.terrain;
    if (!ctx || !map || !terrain) return;

    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (cw === 0 || ch === 0) return;
    if (this.canvas.width !== Math.round(cw * this.dpr) || this.canvas.height !== Math.round(ch * this.dpr)) {
      this.canvas.width = Math.round(cw * this.dpr);
      this.canvas.height = Math.round(ch * this.dpr);
    }

    this.updateCamera(cw, ch, dtMs);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = MAP_PALETTE.unexplored;
    ctx.fillRect(0, 0, cw, ch);

    const { scale, offsetX, offsetY } = this.fit();
    const drawW = terrain.width * scale;
    const drawH = terrain.height * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(terrain, offsetX, offsetY, drawW, drawH);

    this.paintFog(ctx, map, offsetX, offsetY, drawW, drawH);

    const tilePx = CACHE_TILE * scale;
    const strokeW = Math.max(0.75, Math.min(2, tilePx * 0.1));
    const radius = Math.max(1.5, tilePx * 0.44 - strokeW);

    const focus = this.focusPosition();

    const isSeen = (x: number, y: number): boolean => {
      if (!this.fogRooms) return true;
      if (focus && this.mapTiles) {
        const ox = Math.round(focus.x);
        const oy = Math.round(focus.y);
        const dx = x - ox;
        const dy = y - oy;
        if (
          dx * dx + dy * dy <= TORCH_TILES * TORCH_TILES &&
          hasLineOfSight(this.mapTiles, map.width, map.height, ox, oy, x, y)
        ) {
          return true;
        }
      }
      if (!this.seenTiles) return false;
      const i = y * map.width + x;
      return ((this.seenTiles[i >> 3] ?? 0) & (1 << (i & 7))) !== 0;
    };

    this.drawTrails(ctx, offsetX, offsetY, tilePx);
    this.drawRoomTitles(ctx, map, offsetX, offsetY, tilePx, cw, ch);
    this.drawMonsters(ctx, offsetX, offsetY, tilePx, cw, ch, radius, strokeW, started, isSeen);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const token of this.tokens) {
      const pos = this.tokenPosition(token);
      if (this.wallProbe) this.probeWall(map, token, pos);
      const cx = offsetX + (pos.x + 0.5) * tilePx;
      const cy = offsetY + (pos.y + 0.5) * tilePx;
      if (cx < -tilePx || cy < -tilePx || cx > cw + tilePx || cy > ch + tilePx) continue;

      const dimmed = this.focusTokenId !== null && token.id !== this.focusTokenId;
      if (dimmed && !isSeen(Math.round(pos.x), Math.round(pos.y))) continue;
      ctx.globalAlpha = dimmed ? 0.55 : 1;

      if (this.focusTokenId === token.id) {
        const pulse = this.reduced ? 0 : 0.12 * Math.sin(started / 420);
        ctx.beginPath();
        ctx.arc(cx, cy, radius * (1.9 + pulse) + strokeW, 0, Math.PI * 2);
        ctx.strokeStyle = FX_PALETTE.clash;
        ctx.lineWidth = Math.max(1.25, strokeW);
        ctx.stroke();
      }

      const crew = this.rosters.get(token.id);
      if (tilePx >= UNFOLD_TILE_PX && crew && crew.length > 0) {
        this.drawCrew(ctx, crew, token, cx, cy, tilePx, strokeW);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 1;
        continue;
      }

      ctx.fillStyle = teamColor(token.colorIndex);
      ctx.strokeStyle = MAP_PALETTE.wallInk;
      ctx.lineWidth = strokeW;
      drawShape(ctx, teamShape(token.colorIndex), cx, cy, radius);
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (radius >= 7) {
        ctx.font = `700 ${Math.round(radius * 0.95)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = MAP_PALETTE.wallInk;
        ctx.fillText(token.monogram, cx, cy + 0.5);
      }
    }

    this.fxLayer.step(started, dtMs, this.reduced);
    this.fxLayer.draw(ctx, { offsetX, offsetY, tilePx, width: cw, height: ch }, started);

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
    this.fxLayer.clearParticles();
    this.fxQueue = null;
    if (this.terrain) {
      this.terrain.width = 0;
      this.terrain = null;
    }
    if (this.fogMask) {
      this.fogMask.width = 0;
      this.fogMask = null;
      this.fogMaskKey = '';
    }
  }
}
