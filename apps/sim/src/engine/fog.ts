import { forEachVisible, hasLineOfSight } from '@donjon/shared';
import type { Floor, Team } from './types.js';

export const SIGHT_TILES = 5;

export function bitsetFor(team: Team, floor: Floor): Uint8Array {
  const existing = team.exploredTiles.get(floor.id);
  if (existing) return existing;
  const fresh = new Uint8Array(Math.ceil((floor.width * floor.height) / 8));
  team.exploredTiles.set(floor.id, fresh);
  return fresh;
}

export function markSeen(team: Team, floor: Floor, cx: number, cy: number, radius = SIGHT_TILES): void {
  const bits = bitsetFor(team, floor);
  forEachVisible(floor.tiles, floor.width, floor.height, cx, cy, radius, (x, y) => {
    const index = y * floor.width + x;
    bits[index >> 3] = (bits[index >> 3] ?? 0) | (1 << (index & 7));
  });
}

export function canSee(floor: Floor, ox: number, oy: number, x: number, y: number, radius = SIGHT_TILES): boolean {
  const dx = x - ox;
  const dy = y - oy;
  if (dx * dx + dy * dy > radius * radius) return false;
  return hasLineOfSight(floor.tiles, floor.width, floor.height, ox, oy, x, y);
}

export function hasSeen(team: Team, floor: Floor, x: number, y: number): boolean {
  const bits = team.exploredTiles.get(floor.id);
  if (!bits) return false;
  const index = y * floor.width + x;
  return ((bits[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
}

export function encodeFog(team: Team): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [floorId, bits] of team.exploredTiles) {
    out[String(floorId)] = Buffer.from(bits).toString('base64');
  }
  return out;
}

export function decodeFog(raw: string): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [floorId, b64] of Object.entries(parsed)) {
      out.set(Number(floorId), new Uint8Array(Buffer.from(b64, 'base64')));
    }
  } catch {
    return out;
  }
  return out;
}
