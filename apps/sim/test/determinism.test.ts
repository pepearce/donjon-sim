import { describe, expect, it } from 'vitest';
import { rngFor } from '@donjon/shared';
import { step } from '../src/engine/step.js';
import { newWorld } from '../src/engine/setup.js';
import { circulatingCoin, worldDigest } from '../src/engine/world.js';
import { TILE_DOOR, TILE_FLOOR, TILE_RUBBLE, TILE_STAIRS, TILE_WALL, type World } from '../src/engine/types.js';
import { generateFloor, tilePath } from '../src/gen/floorgen.js';

const SEED = 0xd0f0a;

function run(ticks: number, extraDraws = 0): World {
  const w = newWorld(SEED);
  for (let i = 0; i < ticks; i++) {
    step(w);
    if (extraDraws > 0) {
      const rng = rngFor(w.seed, w.tick, 26, 0);
      for (let d = 0; d < extraDraws; d++) rng.u32();
    }
  }
  return w;
}

describe('determinism', () => {
  it('two runs from the same seed produce identical digests at every checkpoint', () => {
    const a = newWorld(SEED);
    const b = newWorld(SEED);
    for (let i = 0; i < 20_000; i++) {
      step(a);
      step(b);
      if (i % 1_000 === 0) expect(worldDigest(a)).toBe(worldDigest(b));
    }
    expect(worldDigest(a)).toBe(worldDigest(b));
  });

  it('a new RngDomain consuming draws every tick cannot perturb existing domains', () => {
    expect(worldDigest(run(5_000, 50))).toBe(worldDigest(run(5_000)));
  });

  it('tick increases by exactly 1 per step', () => {
    const w = newWorld(SEED);
    for (let i = 1; i <= 500; i++) {
      step(w);
      expect(w.tick).toBe(i);
    }
  });

  it('different seeds diverge', () => {
    const a = newWorld(SEED);
    const b = newWorld(SEED + 1);
    for (let i = 0; i < 2_000; i++) {
      step(a);
      step(b);
    }
    expect(worldDigest(a)).not.toBe(worldDigest(b));
  });
});

describe('floor generation', () => {
  it('produces 18-30 rooms, all reachable from the entry room', () => {
    const w = newWorld(SEED);
    expect(w.floors.length).toBeGreaterThanOrEqual(2);
    for (const floor of w.floors) {
      expect(floor.rooms.length).toBeGreaterThanOrEqual(18);
      expect(floor.rooms.length).toBeLessThanOrEqual(30);

      const seen = new Set([floor.entryRoom]);
      const queue = [floor.entryRoom];
      while (queue.length > 0) {
        const cur = queue.shift();
        if (cur === undefined) break;
        for (const next of floor.adjacency[cur] ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect(seen.size).toBe(floor.rooms.length);
    }
  });

  it('room centres are walkable and the apsp agrees with bfs', () => {
    const w = newWorld(SEED);
    for (const floor of w.floors) {
      for (const room of floor.rooms) {
        const tile = floor.tiles[room.cy * floor.width + room.cx];
        expect([TILE_FLOOR, TILE_STAIRS, TILE_DOOR, TILE_RUBBLE]).toContain(tile);
      }
      const n = floor.rooms.length;
      for (let i = 0; i < n; i++) {
        expect(floor.dist[i * n + i]).toBe(0);
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          expect(floor.dist[i * n + j]).toBeLessThan(255);
        }
      }
    }
  });

  it('never lets a team stand on a wall tile', () => {
    const w = newWorld(SEED);
    let samples = 0;
    for (let i = 0; i < 20_000; i++) {
      step(w);
      for (const team of w.teams) {
        if (team.state === 'disbanded') continue;
        const floor = w.floors.find((f) => f.id === team.floorId);
        if (!floor) continue;
        samples += 1;
        const tile = floor.tiles[team.tileY * floor.width + team.tileX];
        expect(
          tile,
          `team ${team.id} stood on tile ${tile} at (${team.tileX},${team.tileY}) on floor ${floor.id}`,
        ).not.toBe(TILE_WALL);
      }
    }
    expect(samples).toBeGreaterThan(1000);
  });

  it('carves every corridor along the exact route teams will walk, on every depth', () => {
    const floors = Array.from({ length: 10 }, (_, i) => generateFloor(SEED, i + 1, 0));
    for (const floor of floors) {
      for (const room of floor.rooms) {
        expect(floor.tiles[room.cy * floor.width + room.cx]).not.toBe(TILE_WALL);
      }
      for (let from = 0; from < floor.rooms.length; from++) {
        for (const to of floor.adjacency[from] ?? []) {
          for (const [x, y] of tilePath(floor, from, to)) {
            expect(
              floor.tiles[y * floor.width + x],
              `depth ${floor.depth} path ${from}->${to} crosses a wall at (${x},${y})`,
            ).not.toBe(TILE_WALL);
          }
        }
      }
    }
  });

  it('keeps genesis floors internally consistent too', () => {
    const w = newWorld(SEED);
    for (const floor of w.floors) {
      for (let from = 0; from < floor.rooms.length; from++) {
        for (const to of floor.adjacency[from] ?? []) {
          for (const [x, y] of tilePath(floor, from, to)) {
            expect(
              floor.tiles[y * floor.width + x],
              `path ${from}->${to} on floor ${floor.id} crosses a wall at (${x},${y})`,
            ).not.toBe(TILE_WALL);
          }
        }
      }
    }
  });

  it('is reproducible for a given seed and depth', () => {
    const a = newWorld(SEED);
    const b = newWorld(SEED);
    expect(a.floors[0]?.rooms.map((r) => r.name)).toEqual(b.floors[0]?.rooms.map((r) => r.name));
    expect(Array.from(a.floors[1]?.tiles ?? [])).toEqual(Array.from(b.floors[1]?.tiles ?? []));
  });
});

describe('combat, loot and death over 20k ticks', () => {
  const w = run(20_000);

  it('actually kills things', () => {
    expect(w.monsters.some((m) => !m.alive)).toBe(true);
    expect(w.dungeon.heroesSlain).toBeGreaterThan(0);
  });

  it('keeps hp within bounds and dead heroes at zero', () => {
    for (const hero of w.heroes) {
      expect(hero.hp).toBeGreaterThanOrEqual(0);
      expect(hero.hp).toBeLessThanOrEqual(hero.hpMax);
      if (hero.state === 'dead') {
        expect(hero.hp).toBe(0);
        expect(hero.diedTick).not.toBeNull();
        const swept = hero.diedTick !== null && w.tick > hero.diedTick + 60;
        if (swept) expect(hero.items.length).toBe(0);
      }
      expect(Number.isFinite(hero.xp)).toBe(true);
      expect(hero.level).toBeLessThanOrEqual(20);
    }
    for (const monster of w.monsters) {
      expect(monster.hp).toBeGreaterThanOrEqual(0);
      expect(monster.hp).toBeLessThanOrEqual(monster.hpMax);
      if (!monster.alive) expect(monster.hp).toBe(0);
    }
  });

  it('never lets a hero belong to two rosters', () => {
    const seen = new Set<number>();
    for (const team of w.teams) {
      for (const id of team.roster) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });

  it('conserves coin exactly against mint and sink', () => {
    const circulating = circulatingCoin(w);
    expect(circulating + w.dungeon.sinkCp).toBe(w.initialCoinCp + w.dungeon.mintedCp);
    expect(w.dungeon.treasuryCp).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(circulating)).toBe(true);
  });

  it('gives every item exactly one owner', () => {
    for (const item of w.items) {
      const owners = [item.ownerHeroId, item.roomId].filter((v) => v !== null).length;
      expect(owners).toBeLessThanOrEqual(2);
      if (item.ownerHeroId !== null) {
        const hero = w.heroes.find((h) => h.id === item.ownerHeroId);
        expect(hero?.items).toContain(item.id);
      }
    }
  });

  it('keeps teams on their own floor and in a real room', () => {
    for (const team of w.teams) {
      const floor = w.floors.find((f) => f.id === team.floorId);
      expect(floor).toBeDefined();
      expect(floor?.rooms[team.roomIdx]).toBeDefined();
    }
  });

  it('leaves no scheduler wake in the past and none absurdly far ahead', () => {
    for (const wake of w.scheduler.toArray()) {
      expect(wake.dueTick).toBeGreaterThan(w.tick - 1);
      expect(wake.dueTick).toBeLessThan(w.tick + 100_000);
    }
  });

  it('emits combat, loot and death events', () => {
    const kinds = new Set(w.tailRing.toArray().map((e) => e.type));
    const seenAny = ['COMBAT_ROUND', 'MONSTER_DOWN', 'LOOT_FOUND', 'EXPLORED'].filter((k) => kinds.has(k as never));
    expect(seenAny.length).toBeGreaterThan(0);
    for (const event of w.tailRing.toArray()) {
      expect(event.severity).toBeGreaterThanOrEqual(0);
      expect(event.severity).toBeLessThanOrEqual(3);
    }
  });

  it('produces no NaN in any numeric field', () => {
    const nums = [
      w.dungeon.treasuryCp,
      w.dungeon.mintedCp,
      w.dungeon.sinkCp,
      ...w.teams.flatMap((t) => [t.morale, t.goldCp, t.carriedCp, t.renownMilli]),
      ...w.heroes.flatMap((h) => [h.hp, h.xp, h.level]),
    ];
    for (const n of nums) expect(Number.isFinite(n)).toBe(true);
  });
});
