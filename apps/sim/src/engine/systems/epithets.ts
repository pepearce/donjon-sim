import { RngDomain, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { EPITHETS } from '../tables.js';
import type { Hero, World } from '../types.js';

export function awardEpithet(world: World, hero: Hero, milestone: string): void {
  if (hero.epithet !== '') return;
  if (hero.state === 'dead') return;
  const pool = EPITHETS.filter((e) => e.requires === milestone);
  if (pool.length === 0) return;

  const rng = rngFor(world.seed, world.tick, RngDomain.EPITHET, hero.id);
  hero.epithet = rng.pick(pool).text;

  emit(world, {
    type: 'HERO_EPITHET_GAINED',
    teamId: hero.teamId,
    heroId: hero.id,
    payload: { hero: hero.name, epithet: hero.epithet, reason: milestone },
  });
}
