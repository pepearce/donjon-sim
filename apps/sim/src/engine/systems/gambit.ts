import { DAY_TICKS, RngDomain, defineTunables, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { keeperLine } from '../keeperLines.js';
import type { World } from '../types.js';
import { adjustKhanStanding, rungOf } from './standing.js';

export const GAMBIT = defineTunables('gambit', {
  gambitDays: { default: 3, min: 1, max: 100, label: 'Gambit duration (days)' },
  gambitCooldownDays: { default: 10, min: 0, max: 365, label: 'Gambit cooldown (days)' },
  gambitTreasuryCeilingCp: { default: 10_000, min: 0, max: 10_000_000, label: 'Gambit treasury ceiling (cp)' },
  gambitMinTreasuryCp: { default: 1000, min: 0, max: 10_000_000, label: 'Gambit treasury minimum (cp)' },
  gambitWinStanding: { default: 15, min: 0, max: 100, label: 'Gambit win standing' },
  gambitLossStanding: { default: -10, min: -100, max: 0, label: 'Gambit loss standing' },
  gambitBaseChance: { default: 0.15, min: 0, max: 1, step: 0.01, label: 'Gambit base chance' },
});

function gambitChance(trait: string): number {
  if (trait === 'gambler') return GAMBIT.gambitBaseChance * 3;
  if (trait === 'miserly') return GAMBIT.gambitBaseChance * 0.5;
  return GAMBIT.gambitBaseChance;
}

export function maybeDeclareGambit(world: World): void {
  const d = world.dungeon;
  if (d.gambit) return;
  const rung = rungOf(d.standing);
  if (rung !== 'censured' && rung !== 'overseer') return;
  if (d.treasuryCp >= GAMBIT.gambitTreasuryCeilingCp) return;
  if (d.treasuryCp < GAMBIT.gambitMinTreasuryCp) return;
  if (world.tick - d.lastGambitEndedTick < GAMBIT.gambitCooldownDays * DAY_TICKS) return;

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
    endsTick: world.tick + GAMBIT.gambitDays * DAY_TICKS,
  };

  emit(world, {
    type: 'KEEPER_GAMBIT',
    payload: {
      action: 'declared',
      stakeCp: stake,
      targetCp: d.gambit.targetCp,
      days: GAMBIT.gambitDays,
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
    adjustKhanStanding(world, GAMBIT.gambitWinStanding);
  } else {
    adjustKhanStanding(world, GAMBIT.gambitLossStanding);
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
