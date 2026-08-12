import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '@donjon/shared';
import { checkAll } from '../src/engine/invariants.js';
import { newWorld } from '../src/engine/setup.js';
import { step } from '../src/engine/step.js';
import { circulatingCoin } from '../src/engine/world.js';
import type { World } from '../src/engine/types.js';

const SEED = 0xd0f0a;
const TICKS = 100_000;
const WINDOW_START = 30_000;

interface Sample {
  tick: number;
  teams: number;
  living: number;
  deaths: number;
  coin: number;
  deepest: number;
}

describe('100k tick soak', () => {
  const world: World = newWorld(SEED);
  const samples: Sample[] = [];
  const violations: string[] = [];
  let maxDeepest = 1;
  let deepestGrewAt = 0;
  let loanClearedAt = 0;

  const started = Date.now();
  for (let i = 1; i <= TICKS; i++) {
    step(world);

    if (i % 500 === 0) {
      for (const v of checkAll(world)) {
        if (violations.length < 20) violations.push(`t${i} ${v.id}: ${v.detail}`);
      }
    }

    const deepest = Math.max(...world.teams.map((t) => t.deepestFloor), 1);
    if (deepest > maxDeepest) {
      maxDeepest = deepest;
      deepestGrewAt = i;
    }
    if (world.dungeon.loanCp === 0) loanClearedAt = i;

    if (i % DAY_TICKS === 0) {
      samples.push({
        tick: i,
        teams: world.teams.filter((t) => t.state !== 'disbanded').length,
        living: world.heroes.filter((h) => h.state !== 'dead').length,
        deaths: world.heroes.filter((h) => h.state === 'dead').length,
        coin: circulatingCoin(world),
        deepest,
      });
    }
  }
  const elapsedMs = Date.now() - started;

  const window = samples.filter((s) => s.tick >= WINDOW_START);
  const mean = (pick: (s: Sample) => number): number =>
    window.reduce((n, s) => n + pick(s), 0) / Math.max(1, window.length);

  it('runs 100k ticks inside the time budget', () => {
    expect(elapsedMs).toBeLessThan(60_000);
    expect(world.tick).toBe(TICKS);
  });

  it('violates no invariant at any 500-tick checkpoint', () => {
    expect(violations.slice(0, 5)).toEqual([]);
  });

  it('never goes extinct and never explodes', () => {
    for (const s of samples) {
      expect(s.living).toBeGreaterThanOrEqual(1);
      expect(s.teams).toBeLessThanOrEqual(10);
    }
    expect(mean((s) => s.living)).toBeGreaterThan(10);
  });

  it('holds a steady team population', () => {
    const avgTeams = mean((s) => s.teams);
    expect(avgTeams).toBeGreaterThanOrEqual(2);
    expect(avgTeams).toBeLessThanOrEqual(10);
  });

  it('keeps circulating coin bounded and non-degenerate', () => {
    for (const s of window) {
      expect(s.coin).toBeGreaterThan(0);
      expect(s.coin).toBeLessThan(5_000_000);
    }
  });

  it('conserves coin exactly for the whole run', () => {
    expect(circulatingCoin(world) + world.dungeon.sinkCp).toBe(
      world.initialCoinCp + world.dungeon.mintedCp,
    );
  });

  it('pushes the frontier deeper at least once in the run', () => {
    expect(maxDeepest).toBeGreaterThan(1);
    expect(deepestGrewAt).toBeGreaterThan(0);
  });

  it('never leaves the Khan loan permanently outstanding', () => {
    expect(world.dungeon.loanCp).toBeLessThanOrEqual(25_000);
    expect(loanClearedAt).toBeGreaterThan(0);
    expect(TICKS - loanClearedAt).toBeLessThan(80_000);
  });

  it('keeps heroes dying at a non-zero, non-absurd rate', () => {
    const last = samples[samples.length - 1];
    const days = TICKS / DAY_TICKS;
    const perDay = (last?.deaths ?? 0) / days;
    expect(perDay).toBeGreaterThan(0.5);
    expect(perDay).toBeLessThan(60);
  });

  it('lets heroes actually level up over the run', () => {
    const maxLevel = Math.max(...world.heroes.map((h) => h.level));
    expect(maxLevel).toBeGreaterThan(3);
  });
});
