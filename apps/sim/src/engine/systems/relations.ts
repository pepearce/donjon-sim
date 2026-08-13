import { defineTunables } from '@donjon/shared';
import { emit } from '../emit.js';
import { livingRoster } from '../world.js';
import { addRelation, clamp, relationTo, type Hero, type Team, type World } from '../types.js';

export const RELATIONS = defineTunables('relations', {
  bondThreshold: { default: 40, min: 0, max: 100, label: 'Bond threshold' },
  grudgeThreshold: { default: -40, min: -100, max: 0, label: 'Grudge threshold' },
});

export function linkPair(world: World, a: Hero, b: Hero, delta: number): void {
  if (a.id === b.id || delta === 0) return;

  const beforeA = relationTo(a, b.id);
  const beforeB = relationTo(b, a.id);
  const afterA = addRelation(a, b.id, delta);
  const afterB = addRelation(b, a.id, delta);

  if (delta > 0) {
    const crossed =
      (beforeA < RELATIONS.bondThreshold && afterA >= RELATIONS.bondThreshold) ||
      (beforeB < RELATIONS.bondThreshold && afterB >= RELATIONS.bondThreshold);
    if (!crossed) return;
    emit(world, {
      type: 'HERO_BOND_FORMED',
      teamId: a.teamId,
      heroId: a.id,
      payload: { hero: a.name, other: b.name, a: a.name, b: b.name, v: Math.max(afterA, afterB) },
    });
    return;
  }

  const crossed =
    (beforeA > RELATIONS.grudgeThreshold && afterA <= RELATIONS.grudgeThreshold) ||
    (beforeB > RELATIONS.grudgeThreshold && afterB <= RELATIONS.grudgeThreshold);
  if (!crossed) return;
  emit(world, {
    type: 'HERO_GRUDGE_FORMED',
    teamId: a.teamId,
    heroId: a.id,
    payload: { hero: a.name, other: b.name, a: a.name, b: b.name, v: Math.min(afterA, afterB) },
  });
}

export function linkAllPairs(world: World, crew: Hero[], delta: number): void {
  const sorted = [...crew].sort((a, b) => a.id - b.id);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (!a || !b) continue;
      if (delta > 0 && (relationTo(a, b.id) < 0 || relationTo(b, a.id) < 0)) continue;
      linkPair(world, a, b, delta);
    }
  }
}

export function bondToward(crew: Hero[], victimId: number): number {
  let total = 0;
  for (const hero of crew) {
    if (hero.id === victimId) continue;
    total += relationTo(hero, victimId);
  }
  return total;
}

export function griefMultiplier(crew: Hero[], victimId: number): number {
  return 1 + clamp(0, 1, bondToward(crew, victimId) / 200);
}

export function fleeGrudges(world: World, team: Team): void {
  linkAllPairs(world, livingRoster(world, team), -25);
}
