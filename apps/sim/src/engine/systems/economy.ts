import { DAY_TICKS, applyBp } from '@donjon/shared';
import { emit } from '../emit.js';
import { circulatingCoin, floorOf, roster } from '../world.js';
import { adjustStanding, creditTollScheme } from './dungeon.js';
import { awardEpithet } from './epithets.js';
import { setRecord } from './records.js';
import { clamp, pushHistory, type Team, type World } from '../types.js';

const RICH_CP = 5000;
const BIG_HAUL_CP = 2000;

export const COIN_SETPOINT = 150_000;

export function priceIndex(circulating: number): number {
  return clamp(0.6, 2.5, Math.sqrt(circulating / COIN_SETPOINT));
}

export function khanTaxBp(circulating: number): number {
  return Math.round(clamp(200, 3500, 1000 + (circulating - COIN_SETPOINT) * 4e-5));
}

export function payEntryFee(world: World, team: Team): void {
  const fee = world.dungeon.entryFeeCp;
  const paid = Math.min(team.goldCp, fee);
  team.goldCp -= paid;
  world.dungeon.treasuryCp += paid;
  if (paid > 0) {
    adjustStanding(team, 2);
    emit(world, {
      type: 'ENTRY_FEE_PAID',
      teamId: team.id,
      floorId: team.floorId,
      payload: { team: team.name, cp: paid },
    });
  }
}

export function bankLoot(world: World, team: Team): void {
  if (team.carriedCp <= 0) return;
  const carried = team.carriedCp;
  const toll = applyBp(carried, world.dungeon.tollBp);
  const circulating = circulatingCoin(world);
  const khan = applyBp(carried, khanTaxBp(circulating));

  world.dungeon.treasuryCp += toll;
  world.dungeon.sinkCp += khan;

  const net = carried - toll - khan;
  const crew = roster(world, team).filter((h) => h.state !== 'dead');
  const shares = crew.length > 0 ? Math.floor((net * 0.25) / crew.length) : 0;
  let distributed = 0;
  for (const hero of crew) {
    hero.goldCp += shares;
    distributed += shares;
  }

  team.goldCp += net - distributed;
  team.carriedCp = 0;

  emit(world, {
    type: 'TOLL_PAID',
    teamId: team.id,
    payload: { team: team.name, carriedCp: carried, tollCp: toll, khanCp: khan },
  });

  const floor = floorOf(world, team.floorId);
  team.renownMilli += Math.round(25 * (floor?.depth ?? 1) * 1000);
  world.dungeon.fameMilli += Math.round(400 * Math.log10(1 + carried / 100) * 1000);

  adjustStanding(team, 1);
  creditTollScheme(world, toll);

  for (const hero of [...crew].sort((a, b) => a.id - b.id)) {
    if (hero.goldCp >= RICH_CP) awardEpithet(world, hero, 'rich');
  }

  if (carried >= BIG_HAUL_CP) {
    pushHistory(team, world.tick, 'haul', `${team.name} hauled ${carried}cp up the stairs in one trip.`);
  }
  setRecord(world, 'haul', 'largest single haul', carried, team.name, team);
  setRecord(world, 'toll', 'largest single toll', toll, team.name, team);
}

export function dailyUpkeep(world: World): void {
  let wages = 0;
  for (const monster of world.monsters) {
    if (!monster.alive) continue;
    wages += monster.wageCpPerDay;
  }
  if (world.dungeon.austerity) wages = 0;

  const paid = Math.min(world.dungeon.treasuryCp, wages);
  world.dungeon.treasuryCp -= paid;
  world.dungeon.sinkCp += paid;
  if (paid > 0) {
    emit(world, { type: 'WAGE_PAID', payload: { cp: paid, staff: world.monsters.filter((m) => m.alive).length } });
  }

  const circulating = circulatingCoin(world);
  const index = priceIndex(circulating);

  for (const team of world.teams) {
    if (team.state === 'disbanded') continue;
    const crew = roster(world, team).filter((h) => h.state !== 'dead');
    const upkeep = Math.round(300 * crew.length * index);
    const spend = Math.min(team.goldCp, upkeep);
    team.goldCp -= spend;
    world.dungeon.sinkCp += spend;
    team.rations = clamp(0, 60, team.rations + (spend >= upkeep ? 12 : -6));
  }
}

export function restAndHeal(world: World, team: Team): void {
  const circulating = circulatingCoin(world);
  const index = priceIndex(circulating);
  const crew = roster(world, team).filter((h) => h.state === 'ok');
  let cost = 0;

  for (const hero of crew) {
    const missing = hero.hpMax - hero.hp;
    if (missing <= 0) continue;
    const heal = Math.min(missing, Math.max(1, Math.round(hero.hpMax * 0.06)));
    const price = Math.round(40 * heal * index);
    if (team.goldCp < price) break;
    team.goldCp -= price;
    world.dungeon.sinkCp += price;
    hero.hp += heal;
    cost += price;
  }

  team.rations = Math.max(0, team.rations - 1);
  team.morale = clamp(0, 100, team.morale + 2);

  if (cost > 0 && world.tick % 20 === 0) {
    emit(world, { type: 'REST', teamId: team.id, floorId: team.floorId, payload: { cp: cost, team: team.name } });
  }
}

export function isDayBoundary(tick: number): boolean {
  return tick % DAY_TICKS === 0;
}
