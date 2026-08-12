import { describe, expect, it } from 'vitest';
import { newWorld } from '../src/engine/setup.js';
import { step } from '../src/engine/step.js';
import { roster } from '../src/engine/world.js';
import { atHearth } from '../src/engine/systems/economy.js';
import type { World } from '../src/engine/types.js';

const SEED = 0xd0f0a;

function stockedOn(world: World, depth: number): number {
  const floor = world.floors.find((f) => f.depth === depth);
  if (!floor) return -1;
  return floor.rooms.filter((r) => r.state === 'stocked').length;
}

describe('dungeon repopulation', () => {
  it('keeps cleared floors stocked once the teams that emptied them have moved on', () => {
    const world = newWorld(SEED);
    const streak = new Map<number, number>();
    const worst = new Map<number, number>();

    for (let i = 0; i < 30_000; i++) {
      step(world);
      if (world.tick < 6_000) continue;
      for (const depth of [1, 2]) {
        const run = stockedOn(world, depth) === 0 ? (streak.get(depth) ?? 0) + 1 : 0;
        streak.set(depth, run);
        if (run > (worst.get(depth) ?? 0)) worst.set(depth, run);
      }
    }

    expect(worst.get(1) ?? 0).toBeLessThan(1_800);
    expect(worst.get(2) ?? 0).toBeLessThan(1_800);
  }, 120_000);

  it('restocks a room some time after combat empties it', () => {
    const world = newWorld(SEED);
    let sawRestocking = false;

    for (let i = 0; i < 4_000; i++) {
      step(world);
      if (world.floors.some((f) => f.rooms.some((r) => r.state === 'restocking'))) {
        sawRestocking = true;
        break;
      }
    }

    expect(sawRestocking).toBe(true);
  }, 60_000);
});

describe('team attrition', () => {
  it('lets hurt parties recover instead of retreating forever at low hp', () => {
    const world = newWorld(SEED);
    let teamTicks = 0;
    let restingTicks = 0;
    let hearthRestTicks = 0;
    let lowTicks = 0;
    let hpSum = 0;

    for (let i = 0; i < 20_000; i++) {
      step(world);
      for (const team of world.teams) {
        if (team.state === 'disbanded') continue;
        const crew = roster(world, team).filter((h) => h.state === 'ok');
        if (crew.length === 0) continue;
        teamTicks += 1;
        if (team.state === 'resting') {
          restingTicks += 1;
          if (atHearth(world, team)) hearthRestTicks += 1;
        }
        const frac = crew.reduce((n, h) => n + h.hp, 0) / crew.reduce((n, h) => n + h.hpMax, 0);
        hpSum += frac;
        if (frac < 0.35) lowTicks += 1;
      }
    }

    const restShare = restingTicks / Math.max(1, teamTicks);
    const meanHp = hpSum / Math.max(1, teamTicks);
    const lowShare = lowTicks / Math.max(1, teamTicks);
    console.log(
      `restShare=${restShare.toFixed(3)} hearthRest=${hearthRestTicks} meanHp=${meanHp.toFixed(3)} lowShare=${lowShare.toFixed(3)}`,
    );
    expect(restShare).toBeGreaterThan(0.05);
    expect(lowShare).toBeLessThan(0.2);
  }, 120_000);

  it('gives every floor a hearth away from the entry and the stairs', () => {
    const world = newWorld(SEED);
    for (let i = 0; i < 8_000; i++) step(world);

    for (const floor of world.floors) {
      expect(floor.hearthRoom).not.toBe(floor.entryRoom);
      expect(floor.hearthRoom).not.toBe(floor.stairsRoom);
      expect(floor.rooms[floor.hearthRoom]).toBeDefined();
    }
  }, 60_000);
});
