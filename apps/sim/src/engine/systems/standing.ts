import { RngDomain, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { keeperLine } from '../keeperLines.js';
import { GUARDIAN_NAMES } from '../tables.js';
import { clamp, type World } from '../types.js';

export type Rung = 'favored' | 'good' | 'censured' | 'overseer';

export const FAVORED_STANDING = 75;
export const GOOD_STANDING = 40;
export const CENSURED_STANDING = 15;
export const EPOCH_STANDING = 50;

const RUNG_ORDER: Rung[] = ['overseer', 'censured', 'good', 'favored'];

export function rungOf(standing: number): Rung {
  if (standing >= FAVORED_STANDING) return 'favored';
  if (standing >= GOOD_STANDING) return 'good';
  if (standing >= CENSURED_STANDING) return 'censured';
  return 'overseer';
}

function rungRank(rung: Rung): number {
  return RUNG_ORDER.indexOf(rung);
}

export function adjustKhanStanding(world: World, delta: number): void {
  const d = world.dungeon;
  const before = rungOf(d.standing);
  let next = clamp(0, 100, d.standing + delta);
  if (d.keeperTrait === 'vain' && delta < 0 && rungRank(rungOf(next)) < rungRank(before)) {
    next = clamp(0, 100, next - 1);
  }
  d.standing = next;

  const after = rungOf(d.standing);
  if (after === before) return;

  const rose = rungRank(after) > rungRank(before);
  emit(world, {
    type: 'KEEPER_RUNG_CHANGED',
    payload: {
      from: before,
      to: after,
      standing: d.standing,
      text: keeperLine(world, rose ? 'rung_up' : 'rung_down'),
    },
  });

  if (after === 'overseer') {
    const overseer = rngFor(world.seed, world.tick, RngDomain.KEEPER_PERSONA, 1).pick(GUARDIAN_NAMES);
    d.overseerName = overseer.name;
    emit(world, {
      type: 'KHAN_OVERSEER',
      payload: { action: 'installed', overseer: overseer.name, text: keeperLine(world, 'overseer_installed') },
    });
  } else if (before === 'overseer') {
    const departing = d.overseerName;
    d.overseerName = '';
    emit(world, {
      type: 'KHAN_OVERSEER',
      payload: { action: 'dismissed', overseer: departing, text: keeperLine(world, 'overseer_dismissed') },
    });
  }
}

export const SOLVENT_TREASURY_CP = 5_000;

export function updateStandingDaily(world: World, wagesPaidInFull: boolean): void {
  const d = world.dungeon;
  if (d.austerity || d.treasuryCp < SOLVENT_TREASURY_CP) {
    adjustKhanStanding(world, -2);
  } else if (wagesPaidInFull) {
    adjustKhanStanding(world, 1);
  }
}
