import { describe, expect, it } from 'vitest';
import { DAY_TICKS, RngDomain, TICK_MS, rngFor, watchAt } from '@donjon/shared';

describe('rngFor', () => {
  it('is reproducible for the same coordinates', () => {
    const a = rngFor(1234, 99, RngDomain.TEAM_AI, 7);
    const b = rngFor(1234, 99, RngDomain.TEAM_AI, 7);
    const left = Array.from({ length: 32 }, () => a.u32());
    const right = Array.from({ length: 32 }, () => b.u32());
    expect(left).toEqual(right);
  });

  it('decorrelates across domain, tick and entity', () => {
    const base = rngFor(1234, 99, RngDomain.TEAM_AI, 7).u32();
    expect(rngFor(1234, 99, RngDomain.MOVEMENT, 7).u32()).not.toBe(base);
    expect(rngFor(1234, 100, RngDomain.TEAM_AI, 7).u32()).not.toBe(base);
    expect(rngFor(1234, 99, RngDomain.TEAM_AI, 8).u32()).not.toBe(base);
    expect(rngFor(1235, 99, RngDomain.TEAM_AI, 7).u32()).not.toBe(base);
  });

  it('RngDomain values are append-only and never reused', () => {
    const frozen = {
      FLOORGEN: 1,
      ROOM_STOCK: 2,
      MONSTER_PICK: 3,
      LOOT_ROLL: 4,
      TRAP_ROLL: 5,
      COMBAT_INIT: 6,
      COMBAT_HIT: 7,
      COMBAT_DMG: 8,
      COMBAT_TARGET: 9,
      MORALE: 10,
      STABILIZE: 11,
      PERMADEATH: 12,
      TEAM_AI: 13,
      MOVEMENT: 14,
      RECRUIT: 15,
      HERO_GEN: 16,
      NAME_GEN: 17,
      TEAM_GEN: 18,
      ECONOMY: 19,
      RESTOCK: 20,
      DECREE: 21,
      EPITHET: 22,
      SCHEDULER: 23,
      FLAVOUR_SELECT: 24,
      FLAVOUR_FILL: 25,
      TRAIT: 27,
      RELATION: 28,
      SCHEME: 29,
      RECORD: 30,
      COMBAT_TARGET_WEIGHT: 31,
      TEAM_DOCTRINE: 32,
      TEAM_DEST: 33,
      TEAM_ROOMSPOT: 34,
      KEEPER: 35,
    };
    for (const [name, value] of Object.entries(frozen)) {
      expect(RngDomain[name as keyof typeof frozen]).toBe(value);
    }
    const values = Object.values(RngDomain);
    expect(new Set(values).size).toBe(values.length);
  });

  it('int and pick stay in range', () => {
    const rng = rngFor(7, 7, RngDomain.LOOT_ROLL, 1);
    for (let i = 0; i < 500; i++) {
      const v = rng.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 200; i++) expect(items).toContain(rng.pick(items));
  });
});

describe('tick constants', () => {
  it('derives every cadence from TICK_MS', () => {
    expect(TICK_MS).toBe(1000);
    expect(DAY_TICKS).toBe(3600);
    expect(watchAt(0)).toBe('POTRON_MINET');
    expect(watchAt(1200)).toBe('ZENITH');
    expect(watchAt(2400)).toBe('CREPUSCULE');
    expect(watchAt(3600)).toBe('POTRON_MINET');
  });
});
