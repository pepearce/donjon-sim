import { DAY_TICKS, RngDomain, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { clamp, type World } from '../types.js';

const REVENUE_TARGET_CP = 9000;
const LOAN_CP = 25_000;
const DECREES = [
  { id: 'tolls_doubled', text: 'tolls doubled until further notice', tollBp: 3000 },
  { id: 'entry_fee_waived', text: 'entry fee waived for the brave', entryFeeCp: 0 },
  { id: 'corpse_tax_raised', text: 'corpse tax raised, effective immediately', corpseTaxBp: 9500 },
  { id: 'marketing_push', text: 'a recruitment drive in the villages', entryFeeCp: 100 },
  { id: 'austerity_notice', text: 'all guardians to work unpaid this quarter', tollBp: 2200 },
  { id: 'discount_week', text: 'half-price delving week', entryFeeCp: 250 },
];

export function updateFameAndNotoriety(world: World): void {
  const d = world.dungeon;
  d.fameMilli = Math.round(d.fameMilli * 0.999);
  d.notorietyMilli = Math.round(d.notorietyMilli * 0.9988);
}

export function updateAggression(world: World, delvesWithDeath: number, delvesCompleted: number): void {
  const d = world.dungeon;
  if (delvesCompleted > 0) {
    const observed = delvesWithDeath / delvesCompleted;
    d.lethalityEmaMilli = Math.round(0.995 * d.lethalityEmaMilli + 0.005 * observed * 1000);
  }
  d.revenueEmaCp = Math.round(0.99 * d.revenueEmaCp + 0.01 * d.corpseYieldCp);

  const lethality = d.lethalityEmaMilli / 1000;
  const delta =
    0.015 * ((REVENUE_TARGET_CP - d.revenueEmaCp) / REVENUE_TARGET_CP) - 0.02 * (lethality - 0.22);

  d.aggressionMilli = Math.round(clamp(550, 1750, d.aggressionMilli + delta * 1000));
  d.corpseYieldCp = 0;
}

export function updateKeeperMood(world: World): void {
  const d = world.dungeon;
  if (d.treasuryCp < 5_000) d.keeperMood = 'bankrupt';
  else if (d.treasuryCp < 30_000) d.keeperMood = 'panicked';
  else if (d.aggressionMilli > 1200) d.keeperMood = 'greedy';
  else d.keeperMood = 'content';
}

export function resolveLoan(world: World): void {
  const d = world.dungeon;

  if (d.treasuryCp < 5_000 && d.loanCp === 0) {
    d.loanCp = LOAN_CP;
    d.treasuryCp += LOAN_CP;
    d.mintedCp += LOAN_CP;
    emit(world, { type: 'KHAN_LOAN', payload: { cp: LOAN_CP, action: 'taken' } });
    return;
  }

  if (d.treasuryCp < 5_000 && d.loanCp > 0 && !d.austerity) {
    d.austerity = true;
    emit(world, {
      type: 'KEEPER_DECREE',
      payload: { decree: 'austerity', text: 'all guardians to work unpaid this quarter' },
    });
    return;
  }

  if (d.treasuryCp > 20_000 && d.loanCp > 0) {
    const pay = Math.min(d.loanCp, Math.floor(d.treasuryCp * 0.25));
    d.treasuryCp -= pay;
    d.sinkCp += pay;
    d.loanCp -= pay;
    if (d.loanCp === 0) {
      d.austerity = false;
      emit(world, { type: 'KHAN_LOAN', payload: { cp: pay, action: 'repaid' } });
    }
  }
}

export function issueDecree(world: World): void {
  if (world.tick % (DAY_TICKS * 2) !== 0) return;
  const rng = rngFor(world.seed, world.tick, RngDomain.DECREE, 0);
  const decree = rng.pick(DECREES);
  const d = world.dungeon;

  if (decree.tollBp !== undefined) d.tollBp = decree.tollBp;
  if (decree.entryFeeCp !== undefined) d.entryFeeCp = decree.entryFeeCp;
  if (decree.corpseTaxBp !== undefined) d.corpseTaxBp = decree.corpseTaxBp;

  emit(world, { type: 'KEEPER_DECREE', payload: { decree: decree.id, text: decree.text } });
}
