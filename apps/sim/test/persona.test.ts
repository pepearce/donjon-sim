import { describe, expect, it } from 'vitest';
import { KEEPER_OCCASIONS, keeperLine } from '../src/engine/keeperLines.js';
import { KEEPER_TRAITS, rollKeeperPersona } from '../src/engine/keeperPersona.js';
import { newWorld } from '../src/engine/setup.js';

const SEED = 0xd0f0a;

describe('keeper persona', () => {
  it('rolls the same persona for the same seed', () => {
    const a = rollKeeperPersona(SEED);
    const b = rollKeeperPersona(SEED);
    expect(a).toEqual(b);
    expect(a.name.length).toBeGreaterThan(0);
    expect(KEEPER_TRAITS).toContain(a.trait);
  });

  it('rolls different personas across seeds', () => {
    const names = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) names.add(rollKeeperPersona(seed).name);
    expect(names.size).toBeGreaterThan(1);
  });

  it('stamps the persona onto a new world', () => {
    const world = newWorld(SEED);
    expect(world.dungeon.keeperName).toBe(rollKeeperPersona(SEED).name);
    expect(world.dungeon.keeperTrait).toBe(rollKeeperPersona(SEED).trait);
    expect(world.dungeon.standing).toBe(50);
  });
});

describe('keeper lines', () => {
  it('has a non-empty line for every occasion and trait', () => {
    const world = newWorld(SEED);
    for (const trait of KEEPER_TRAITS) {
      world.dungeon.keeperTrait = trait;
      for (const occasion of KEEPER_OCCASIONS) {
        expect(keeperLine(world, occasion).length, `${trait}/${occasion}`).toBeGreaterThan(0);
      }
    }
  });
});
