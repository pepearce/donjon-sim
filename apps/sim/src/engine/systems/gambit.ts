import { DAY_TICKS, RngDomain, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { keeperLine } from '../keeperLines.js';
import type { World } from '../types.js';
import { adjustKhanStanding, rungOf } from './standing.js';

export const GAMBIT_DAYS = 3;
export const GAMBIT_COOLDOWN_DAYS = 10;
export const GAMBIT_TREASURY_CEILING_CP = 10_000;
export const GAMBIT_MIN_TREASURY_CP = 1_000;
export const GAMBIT_WIN_STANDING = 15;
export const GAMBIT_LOSS_STANDING = -10;
const GAMBIT_BASE_CHANCE = 0.15;

function gambitChance(trait: string): number {
  if (trait === 'gambler') return GAMBIT_BASE_CHANCE * 3;
  if (trait === 'miserly') return GAMBIT_BASE_CHANCE * 0.5;
  return GAMBIT_BASE_CHANCE;
}

export function maybeDeclareGambit(world: World): void {
  const d = world.dungeon;
  if (d.gambit) return;
  const rung = rungOf(d.standing);
  if (rung !== 'censured' && rung !== 'overseer') return;
  if (d.treasuryCp >= GAMBIT_TREASURY_CEILING_CP) return;
  if (d.treasuryCp < GAMBIT_MIN_TREASURY_CP) return;
  if (world.tick - d.lastGambitEndedTick < GAMBIT_COOLDOWN_DAYS * DAY_TICKS) return;

  const rng = rngFor(world.seed, world.tick, RngDomain.KEEPER_GAMBIT, 0);
  if (!rng.chance(gambitChance(d.keeperTrait))) return;

  const stake = Math.floor(d.treasuryCp / 2);
  d.treasuryCp -= stake;
  d.sinkCp += stake;
  d.gambit = {
    stakeCp: stake,
    targetCp: Math.max(400, Math.floor(stake * 0.6)),
    collectedCp: 0,
    startedTick: world.tick,
    endsTick: world.tick + GAMBIT_DAYS * DAY_TICKS,
  };

  emit(world, {
    type: 'KEEPER_GAMBIT',
    payload: {
      action: 'declared',
      stakeCp: stake,
      targetCp: d.gambit.targetCp,
      days: GAMBIT_DAYS,
      text: keeperLine(world, 'gambit_declared'),
    },
  });
}

export function creditTollGambit(world: World, tollCp: number): void {
  const gambit = world.dungeon.gambit;
  if (!gambit) return;
  gambit.collectedCp += tollCp;
}

export function tickGambit(world: World): void {
  const d = world.dungeon;
  const gambit = d.gambit;
  if (!gambit || world.tick < gambit.endsTick) return;

  const won = gambit.collectedCp >= gambit.targetCp;
  d.gambit = null;
  d.lastGambitEndedTick = world.tick;

  if (won) {
    const payout = gambit.stakeCp * 2;
    d.treasuryCp += payout;
    d.mintedCp += payout;
    adjustKhanStanding(world, GAMBIT_WIN_STANDING);
  } else {
    adjustKhanStanding(world, GAMBIT_LOSS_STANDING);
  }

  emit(world, {
    type: 'KEEPER_GAMBIT',
    payload: {
      action: won ? 'won' : 'lost',
      stakeCp: gambit.stakeCp,
      targetCp: gambit.targetCp,
      collectedCp: gambit.collectedCp,
      text: keeperLine(world, won ? 'gambit_won' : 'gambit_lost'),
    },
  });
}
