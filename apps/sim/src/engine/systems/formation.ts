import type { Hero } from '../types.js';
import { hasTrait } from './traits.js';

export type HeroLine = 'front' | 'back';

const CLASS_SCORE: Record<string, number> = {
  sabreur: 2,
  bruiser: 2,
  cutpurse: 1,
  sapper: 0,
  thaumaturge: -2,
  pretre: -2,
};

export function lineOf(hero: Hero): HeroLine {
  let score = CLASS_SCORE[hero.className] ?? 0;
  if (hasTrait(hero, 'bold')) score += 1;
  if (hasTrait(hero, 'reckless')) score += 1;
  if (hasTrait(hero, 'glory_hound')) score += 1;
  if (hasTrait(hero, 'cautious')) score -= 1;
  if (hasTrait(hero, 'craven')) score -= 2;
  return score >= 0 ? 'front' : 'back';
}
