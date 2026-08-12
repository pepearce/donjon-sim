import { describe, expect, it } from 'vitest';
import { forEachVisible, hasLineOfSight, visibleTiles } from '../src/los.js';

const OPEN = 1;
const WALL = 0;

function grid(rows: string[]): { tiles: Uint8Array; width: number; height: number } {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const tiles = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) tiles[y * width + x] = row[x] === '#' ? WALL : OPEN;
  });
  return { tiles, width, height };
}

describe('hasLineOfSight', () => {
  it('sees straight down an open corridor', () => {
    const g = grid(['.......']);
    expect(hasLineOfSight(g.tiles, g.width, g.height, 0, 0, 6, 0)).toBe(true);
  });

  it('is blocked by a wall between observer and target', () => {
    const g = grid(['...#...']);
    expect(hasLineOfSight(g.tiles, g.width, g.height, 0, 0, 6, 0)).toBe(false);
  });

  it('still sees the blocking wall itself', () => {
    const g = grid(['...#...']);
    expect(hasLineOfSight(g.tiles, g.width, g.height, 0, 0, 3, 0)).toBe(true);
  });

  it('sees its own tile even when standing on a wall', () => {
    const g = grid(['#']);
    expect(hasLineOfSight(g.tiles, g.width, g.height, 0, 0, 0, 0)).toBe(true);
  });

  it('does not see through a diagonal wall', () => {
    const g = grid(['..#', '.#.', '...']);
    expect(hasLineOfSight(g.tiles, g.width, g.height, 0, 2, 2, 0)).toBe(false);
  });

  it('reports nothing outside the grid', () => {
    const g = grid(['...']);
    expect(hasLineOfSight(g.tiles, g.width, g.height, 0, 0, 5, 0)).toBe(false);
  });
});

describe('visibleTiles', () => {
  it('reveals an open room out to the radius and no further', () => {
    const g = grid([
      '.....',
      '.....',
      '.....',
      '.....',
      '.....',
    ]);
    const seen = visibleTiles(g.tiles, g.width, g.height, 2, 2, 1);
    expect(seen.has(2 * 5 + 2)).toBe(true);
    expect(seen.has(2 * 5 + 1)).toBe(true);
    expect(seen.has(2 * 5 + 4)).toBe(false);
  });

  it('reveals the wall of a sealed room but nothing beyond it', () => {
    const g = grid([
      '#####',
      '#...#',
      '#...#',
      '#####',
      '.....',
    ]);
    const seen = visibleTiles(g.tiles, g.width, g.height, 2, 2, 6);
    expect(seen.has(0 * 5 + 2)).toBe(true);
    expect(seen.has(3 * 5 + 2)).toBe(true);
    expect(seen.has(4 * 5 + 2)).toBe(false);
    expect(seen.has(4 * 5 + 0)).toBe(false);
  });

  it('does not leak around a corner into an adjoining room', () => {
    const g = grid([
      '#######',
      '#..#..#',
      '#..#..#',
      '#######',
    ]);
    const seen = visibleTiles(g.tiles, g.width, g.height, 1, 1, 6);
    expect(seen.has(1 * 7 + 2)).toBe(true);
    expect(seen.has(1 * 7 + 3)).toBe(true);
    expect(seen.has(1 * 7 + 4)).toBe(false);
    expect(seen.has(2 * 7 + 5)).toBe(false);
  });

  it('only visits whole tiles when the radius is fractional', () => {
    const g = grid(['.....', '.....', '.....', '.....', '.....']);
    const visited: Array<[number, number]> = [];
    forEachVisible(g.tiles, g.width, g.height, 2, 2, 1.5, (x, y) => {
      visited.push([x, y]);
    });
    expect(visited.length).toBeGreaterThan(0);
    for (const [x, y] of visited) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(y)).toBe(true);
    }
  });

  it('forEachVisible agrees with visibleTiles', () => {
    const g = grid(['.....', '.#...', '.....']);
    const seen = visibleTiles(g.tiles, g.width, g.height, 0, 0, 4);
    const collected = new Set<number>();
    forEachVisible(g.tiles, g.width, g.height, 0, 0, 4, (x, y) => {
      collected.add(y * g.width + x);
    });
    expect([...collected].sort((a, b) => a - b)).toEqual([...seen].sort((a, b) => a - b));
  });
});
