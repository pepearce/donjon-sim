import { DAY_TICKS, RngDomain, defineTunables, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { MAX_FLOORS, floorOf, livingRoster, roster } from '../world.js';
import { adjustKhanStanding } from './standing.js';
import { awardEpithet } from './epithets.js';
import { makeItem } from './loot.js';
import { clamp, pushHistory, type Floor, type Hero, type Monster, type Room, type Team, type World } from '../types.js';

export const APEX = defineTunables('apex', {
  crMult: { default: 1.6, min: 1, max: 10, step: 0.1, label: 'Apex CR multiplier' },
  hoardCp: { default: 6000, min: 0, max: 1_000_000, label: 'Apex hoard (cp)' },
  hoardRolls: { default: 2, min: 0, max: 10, label: 'Apex hoard item rolls' },
  respawnDays: { default: 2, min: 0, max: 100, label: 'Apex respawn (days)' },
  rampPerEpoch: { default: 0.12, min: 0, max: 2, step: 0.01, label: 'Epoch CR ramp' },
  depthExponent: { default: 2, min: 0, max: 6, step: 0.1, label: 'Epoch ramp depth exponent' },
  decayDays: { default: 6, min: 1, max: 365, label: 'Epoch decay after (days)' },
  retireBase: { default: 0.1, min: 0, max: 1, step: 0.01, label: 'Triumph retire base chance' },
  retirePerLevel: { default: 0.008, min: 0, max: 0.1, step: 0.001, label: 'Triumph retire per level' },
});

export function effectiveDangerCr(world: World, floor: Floor): number {
  const ramp =
    APEX.rampPerEpoch * world.dungeon.apexEpoch * (floor.depth / MAX_FLOORS) ** APEX.depthExponent;
  return floor.dangerCr * (1 + ramp);
}

export function isApexRoom(floor: Floor, room: Room): boolean {
  return floor.depth === MAX_FLOORS && room.idx === floor.stairsRoom;
}

function retireChance(hero: Hero): number {
  const wealth = Math.min(0.15, hero.goldCp / 100_000);
  const scar = hero.scarred ? 0.05 : 0;
  return clamp(0, 0.9, APEX.retireBase + APEX.retirePerLevel * hero.level + wealth + scar);
}

function retireHero(world: World, team: Team, hero: Hero): void {
  const purse = Math.round(hero.goldCp);
  world.dungeon.sinkCp += purse;
  hero.goldCp = 0;
  hero.retiredTick = world.tick;
  hero.teamId = null;
  team.roster = team.roster.filter((id) => id !== hero.id);
  emit(world, {
    type: 'HERO_RETIRED',
    teamId: team.id,
    heroId: hero.id,
    payload: {
      hero: hero.name,
      level: hero.level,
      className: hero.className,
      goldCp: purse,
      epithet: hero.epithet,
      kills: hero.kills,
      triumphant: 1,
    },
  });
}

function rollRetirements(world: World, team: Team): void {
  const living = [...livingRoster(world, team)].sort((a, b) => a.id - b.id);
  for (const hero of living) {
    const rng = rngFor(world.seed, world.tick, RngDomain.APEX_RETIRE, hero.id);
    if (rng.chance(retireChance(hero))) retireHero(world, team, hero);
  }
}

function scheduleApexRespawn(world: World, boss: Monster): void {
  const floor = floorOf(world, boss.floorId);
  const room = floor?.rooms.find((r) => r.id === boss.roomId);
  if (!room) return;
  const due = world.tick + APEX.respawnDays * DAY_TICKS;
  room.restockDueTick = due;
  world.scheduler.schedule(due, 'RESTOCK', room.id);
}

export function triumph(world: World, team: Team, slayer: Hero, boss: Monster): void {
  const d = world.dungeon;
  d.apexEpoch += 1;
  d.lastTriumphTick = world.tick;

  const hoard = APEX.hoardCp;
  const funded = Math.min(d.treasuryCp, hoard);
  d.treasuryCp -= funded;
  if (funded < hoard) d.mintedCp += hoard - funded;
  team.carriedCp += hoard;

  let itemValue = 0;
  for (let i = 0; i < APEX.hoardRolls; i++) {
    const item = makeItem(world, MAX_FLOORS, null);
    item.ownerTeamId = team.id;
    item.ownerHeroId = slayer.id;
    slayer.items.push(item.id);
    itemValue += item.valueCp;
  }

  team.renownMilli += 500_000;
  d.fameMilli += 2_000_000;
  adjustKhanStanding(world, -10);

  for (const hero of [...livingRoster(world, team)].sort((a, b) => a.id - b.id)) {
    awardEpithet(world, hero, 'triumph');
  }

  pushHistory(
    team,
    world.tick,
    'triumph',
    `${slayer.name} slew ${boss.name} and ${team.name} claimed the vault hoard.`,
  );

  emit(world, {
    type: 'TRIUMPH',
    teamId: team.id,
    heroId: slayer.id,
    floorId: boss.floorId,
    roomId: boss.roomId,
    payload: {
      team: team.name,
      hero: slayer.name,
      monster: boss.name,
      cp: hoard + itemValue,
      epoch: d.apexEpoch,
      depth: MAX_FLOORS,
    },
  });

  scheduleApexRespawn(world, boss);
  rollRetirements(world, team);

  if (roster(world, team).length > 0) {
    team.homeboundTick = world.tick;
    team.lastAction = 'RETREAT';
    team.commitUntilTick = world.tick + 300;
  }
}

export function returnToTavern(world: World, team: Team): void {
  team.homeboundTick = null;
  team.state = 'disbanded';
  team.disbandedTick = world.tick;
  pushHistory(
    team,
    world.tick,
    'homecoming',
    `${team.name} came home to the tavern in triumph and stood the room a round.`,
  );
  emit(world, {
    type: 'PARTY_EXITED',
    teamId: team.id,
    floorId: team.floorId,
    payload: { team: team.name, depth: 1, size: livingRoster(world, team).length, triumphant: 1 },
  });
  emit(world, {
    type: 'TEAM_DISBANDED',
    teamId: team.id,
    payload: { team: team.name, reason: 'went home in triumph' },
  });
}

export function apexDecayDaily(world: World): void {
  const d = world.dungeon;
  if (d.apexEpoch <= 0) return;
  if (world.tick - d.lastTriumphTick < APEX.decayDays * DAY_TICKS) return;
  d.apexEpoch -= 1;
  d.lastTriumphTick = world.tick;
}
