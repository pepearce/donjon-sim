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
  const r2 = radius * radius;
  const minY = Math.max(0, cy - radius);
  const maxY = Math.min(floor.height - 1, cy + radius);
  const minX = Math.max(0, cx - radius);
  const maxX = Math.min(floor.width - 1, cx + radius);

  for (let y = minY; y <= maxY; y++) {
    const dy = y - cy;
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy > r2) continue;
      const index = y * floor.width + x;
      bits[index >> 3] = (bits[index >> 3] ?? 0) | (1 << (index & 7));
    }
  }
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
