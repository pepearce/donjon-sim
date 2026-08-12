export const OPAQUE_TILE = 0;

export function hasLineOfSight(
  tiles: Uint8Array,
  width: number,
  height: number,
  ox: number,
  oy: number,
  tx: number,
  ty: number,
): boolean {
  if (tx < 0 || ty < 0 || tx >= width || ty >= height) return false;
  if (ox === tx && oy === ty) return true;

  let x = ox;
  let y = oy;
  const dx = Math.abs(tx - ox);
  const dy = Math.abs(ty - oy);
  const sx = tx > ox ? 1 : -1;
  const sy = ty > oy ? 1 : -1;
  let err = dx - dy;

  for (;;) {
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
    if (x === tx && y === ty) return true;
    if ((tiles[y * width + x] ?? OPAQUE_TILE) === OPAQUE_TILE) return false;
  }
}

export function forEachVisible(
  tiles: Uint8Array,
  width: number,
  height: number,
  ox: number,
  oy: number,
  radius: number,
  visit: (x: number, y: number) => void,
): void {
  const r2 = radius * radius;
  const minY = Math.max(0, Math.ceil(oy - radius));
  const maxY = Math.min(height - 1, Math.floor(oy + radius));
  const minX = Math.max(0, Math.ceil(ox - radius));
  const maxX = Math.min(width - 1, Math.floor(ox + radius));

  for (let y = minY; y <= maxY; y++) {
    const dy = y - oy;
    for (let x = minX; x <= maxX; x++) {
      const dx = x - ox;
      if (dx * dx + dy * dy > r2) continue;
      if (!hasLineOfSight(tiles, width, height, ox, oy, x, y)) continue;
      visit(x, y);
    }
  }
}

export function visibleTiles(
  tiles: Uint8Array,
  width: number,
  height: number,
  ox: number,
  oy: number,
  radius: number,
): Set<number> {
  const out = new Set<number>();
  forEachVisible(tiles, width, height, ox, oy, radius, (x, y) => {
    out.add(y * width + x);
  });
  return out;
}
