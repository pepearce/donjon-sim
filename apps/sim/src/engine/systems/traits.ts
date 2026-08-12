import { RngDomain, rngFor } from '@donjon/shared';
import { TRAITS } from '../tables.js';
import { MAX_TRAITS, type Hero, type World } from '../types.js';

export function hasTrait(hero: Hero, id: string): boolean {
  return hero.traits.includes(id);
}

export function traitCount(heroes: Hero[], id: string): number {
  let n = 0;
  for (const hero of heroes) {
    if (hero.traits.includes(id)) n += 1;
  }
  return n;
}

export function traitFrac(heroes: Hero[], id: string): number {
  if (heroes.length === 0) return 0;
  return traitCount(heroes, id) / heroes.length;
}

export function gainTrait(world: World, hero: Hero): void {
  if (hero.traits.length >= MAX_TRAITS) return;
  const pool = TRAITS.filter((t) => !hero.traits.includes(t.id));
  if (pool.length === 0) return;
  const rng = rngFor(world.seed, world.tick, RngDomain.TRAIT, hero.id + 200_000);
  hero.traits.push(rng.pick(pool).id);
}
