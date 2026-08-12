export const RngDomain = {
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
} as const;

export type RngDomain = (typeof RngDomain)[keyof typeof RngDomain];

export function mix32(x: number): number {
  let h = x | 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  h = h ^ (h >>> 15);
  return h >>> 0;
}

export interface Rng {
  u32(): number;
  float(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

export function sfc32(a: number, b: number, c: number, d: number): Rng {
  let s0 = a >>> 0;
  let s1 = b >>> 0;
  let s2 = c >>> 0;
  let s3 = (d | 1) >>> 0;

  const u32 = (): number => {
    const t = (s0 + s1) >>> 0;
    s0 = s1 ^ (s1 >>> 9);
    s1 = (s2 + (s2 << 3)) >>> 0;
    s2 = ((s2 << 21) | (s2 >>> 11)) >>> 0;
    s3 = (s3 + 1) >>> 0;
    const r = (t + s3) >>> 0;
    s2 = (s2 + r) >>> 0;
    return r;
  };

  for (let i = 0; i < 12; i++) u32();

  const rng: Rng = {
    u32,
    float: () => u32() / 4294967296,
    int: (lo, hi) => lo + Math.floor((u32() / 4294967296) * (hi - lo + 1)),
    pick: <T,>(items: readonly T[]): T => {
      const v = items[Math.floor((u32() / 4294967296) * items.length)];
      if (v === undefined) throw new Error('pick from empty list');
      return v;
    },
    chance: (p) => u32() / 4294967296 < p,
  };
  return rng;
}

export function streamSeed(
  worldSeed: number,
  tick: number,
  domain: number,
  entityId: number,
  seq: number,
): [number, number, number, number] {
  const base = mix32(worldSeed ^ mix32(domain * 0x9e3779b1));
  const a = mix32(base ^ mix32(tick));
  const b = mix32(a ^ mix32(entityId + 0x85ebca6b));
  const c = mix32(b ^ mix32(seq + 0xc2b2ae35));
  const d = mix32(c ^ base ^ tick);
  return [a, b, c, d];
}

export function rngFor(
  worldSeed: number,
  tick: number,
  domain: number,
  entityId = 0,
  seq = 0,
): Rng {
  const [a, b, c, d] = streamSeed(worldSeed, tick, domain, entityId, seq);
  return sfc32(a, b, c, d);
}
