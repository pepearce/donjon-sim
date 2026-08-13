import { DAY_TICKS, RngDomain, applyBp, defineTunables, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { keeperLine } from '../keeperLines.js';
import { circulatingCoin, floorOf, monstersIn, roster } from '../world.js';
import { adjustStanding, creditTollScheme } from './dungeon.js';
import { creditTollGambit } from './gambit.js';
import { rungOf, updateStandingDaily } from './standing.js';
import { awardEpithet } from './epithets.js';
import { setRecord } from './records.js';
import { clamp, pushHistory, type Team, type World } from '../types.js';

export const ECON = defineTunables('economy', {
  richCp: { default: 5000, min: 0, max: 1_000_000, label: 'Rich epithet threshold (cp)' },
  bigHaulCp: { default: 2000, min: 0, max: 1_000_000, label: 'Big haul threshold (cp)' },
  coinSetpoint: { default: 150_000, min: 1000, max: 10_000_000, label: 'Coin supply setpoint (cp)' },
  forecloseDays: { default: 5, min: 1, max: 365, label: 'Insolvency grace (days)' },
  quitChance: { default: 0.3, min: 0, max: 1, step: 0.01, label: 'Hero quit chance' },
  guardianQuitChance: { default: 0.1, min: 0, max: 1, step: 0.01, label: 'Guardian quit chance' },
  insolventTreasuryCp: { default: 5000, min: 0, max: 10_000_000, label: 'Insolvency line (cp)' },
  rationBurnEvery: { default: 10, min: 1, max: 1000, label: 'Ration burn cadence' },
  campBurnEvery: { default: 5, min: 1, max: 1000, label: 'Camp ration burn cadence' },
  rationCap: { default: 60, min: 1, max: 10_000, label: 'Ration cap' },
});

export function priceIndex(circulating: number): number {
  return clamp(0.6, 2.5, Math.sqrt(circulating / ECON.coinSetpoint));
}

export function khanTaxBp(circulating: number): number {
  return Math.round(clamp(200, 3500, 1000 + (circulating - ECON.coinSetpoint) * 4e-5));
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
  const skim = rungOf(world.dungeon.standing) === 'overseer' ? Math.floor(toll * 0.2) : 0;
  const kept = toll - skim;

  world.dungeon.treasuryCp += kept;
  world.dungeon.sinkCp += khan + skim;
  creditTollGambit(world, kept);

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
    payload: { team: team.name, carriedCp: carried, tollCp: toll, khanCp: khan, skimCp: skim },
  });

  const floor = floorOf(world, team.floorId);
  team.renownMilli += Math.round(25 * (floor?.depth ?? 1) * 1000);
  world.dungeon.fameMilli += Math.round(400 * Math.log10(1 + carried / 100) * 1000);

  adjustStanding(team, 1);
  creditTollScheme(world, toll);

  for (const hero of [...crew].sort((a, b) => a.id - b.id)) {
    if (hero.goldCp >= ECON.richCp) awardEpithet(world, hero, 'rich');
  }

  if (carried >= ECON.bigHaulCp) {
    world.dungeon.lastBigHaulTeamId = team.id;
    pushHistory(team, world.tick, 'haul', `${team.name} hauled ${carried}cp up the stairs in one trip.`);
  }
  setRecord(world, 'haul', 'largest single haul', carried, team.name, team);
  setRecord(world, 'toll', 'largest single toll', toll, team.name, team);
}

function staffQuits(world: World): void {
  let gone = 0;
  for (const monster of world.monsters) {
    if (!monster.alive) continue;
    const rng = rngFor(world.seed, world.tick, RngDomain.STAFF_QUIT, monster.id);
    if (!rng.chance(monster.guardian ? ECON.guardianQuitChance : ECON.quitChance)) continue;
    monster.alive = false;
    monster.hp = 0;
    gone += 1;
  }
  if (gone === 0) return;

  for (const floor of world.floors) {
    for (const room of floor.rooms) {
      if (room.state !== 'stocked') continue;
      if (monstersIn(world, floor.id, room.idx).length > 0) continue;
      room.state = 'cleared';
      room.restockDueTick = world.tick;
    }
  }

  emit(world, { type: 'STAFF_QUIT', payload: { count: gone } });
}

function trackInsolvency(world: World): void {
  const d = world.dungeon;
  if (d.treasuryCp < ECON.insolventTreasuryCp && d.loanCp > 0) d.insolventDays += 1;
  else d.insolventDays = 0;

  if (rungOf(d.standing) !== 'overseer') return;

  if (d.insolventDays === ECON.forecloseDays - 1) {
    emit(world, {
      type: 'KEEPER_DECREE',
      payload: { decree: 'foreclosure_imminent', text: keeperLine(world, 'foreclosure_imminent') },
    });
  }

  if (d.insolventDays >= ECON.forecloseDays && !world.foreclosed) {
    world.foreclosed = true;
    emit(world, {
      type: 'KHAN_FORECLOSURE',
      payload: { days: d.insolventDays, debtCp: d.loanCp },
    });
  }
}

export function dailyUpkeep(world: World): void {
  let wages = 0;
  for (const monster of world.monsters) {
    if (!monster.alive) continue;
    wages += monster.wageCpPerDay;
  }
  if (world.dungeon.austerity) {
    wages = 0;
    staffQuits(world);
  }
  trackInsolvency(world);

  const paid = Math.min(world.dungeon.treasuryCp, wages);
  world.dungeon.treasuryCp -= paid;
  world.dungeon.sinkCp += paid;
  if (paid > 0) {
    emit(world, { type: 'WAGE_PAID', payload: { cp: paid, staff: world.monsters.filter((m) => m.alive).length } });
  }
  updateStandingDaily(world, paid >= wages);

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

export function atHearth(world: World, team: Team): boolean {
  const floor = floorOf(world, team.floorId);
  return !!floor && floor.hearthRoom === team.roomIdx;
}

export function canCamp(world: World, team: Team): boolean {
  const floor = floorOf(world, team.floorId);
  const room = floor?.rooms[team.roomIdx];
  if (!room || room.state === 'stocked') return false;
  if (team.rations <= 0 && floor?.hearthRoom !== team.roomIdx) return false;
  return !world.monsters.some((m) => m.alive && m.floorId === team.floorId && m.roomId === room.id);
}

export function restAndHeal(world: World, team: Team): void {
  const circulating = circulatingCoin(world);
  const index = priceIndex(circulating);
  const crew = roster(world, team).filter((h) => h.state === 'ok');
  let cost = 0;
  let healed = 0;

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
    healed += heal;
  }

  const hearth = atHearth(world, team);

  if (healed === 0 && canCamp(world, team)) {
    const rate = hearth ? 0.05 : 0.02;
    for (const hero of crew) {
      const missing = hero.hpMax - hero.hp;
      if (missing <= 0) continue;
      hero.hp += Math.min(missing, Math.max(1, Math.round(hero.hpMax * rate)));
    }
    if (world.tick % ECON.campBurnEvery === 0) {
      if (!hearth) team.rations = Math.max(0, team.rations - 1);
      team.morale = clamp(0, 100, team.morale + 1);
    }
  }

  if (!hearth && world.tick % ECON.rationBurnEvery === 0) team.rations = Math.max(0, team.rations - 1);
  team.morale = clamp(0, 100, team.morale + (hearth ? 3 : 2));

  if (cost > 0 && world.tick % 20 === 0) {
    emit(world, { type: 'REST', teamId: team.id, floorId: team.floorId, payload: { cp: cost, team: team.name } });
  }
}

export function atShop(world: World, team: Team): boolean {
  const floor = floorOf(world, team.floorId);
  return !!floor && floor.shopRoom >= 0 && floor.shopRoom === team.roomIdx;
}

export function rationPriceCp(world: World, depth: number): number {
  return Math.max(1, Math.round(22 * priceIndex(circulatingCoin(world)) * (1 + 0.15 * (depth - 1))));
}

export function isDayBoundary(tick: number): boolean {
  return tick % DAY_TICKS === 0;
}
