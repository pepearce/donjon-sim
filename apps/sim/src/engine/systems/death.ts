import { DAY_TICKS, RngDomain, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { floorOf, heroById, itemsOf, livingRoster, roster, teamById } from '../world.js';
import { adjustStanding } from './dungeon.js';
import { awardEpithet } from './epithets.js';
import { fleeGrudges, griefMultiplier } from './relations.js';
import { traitCount } from './traits.js';
import { clamp, pushHistory, roomTitle, type Hero, type World } from '../types.js';

export function resolveBleedOut(world: World, heroId: number): void {
  const hero = heroById(world, heroId);
  if (!hero || hero.state !== 'downed') return;
  const team = hero.teamId === null ? undefined : teamById(world, hero.teamId);

  if (!team) {
    const rng = rngFor(world.seed, world.tick, RngDomain.PERMADEATH, hero.id);
    if (rng.chance(0.5)) killHero(world, hero);
    else {
      hero.state = 'ok';
      hero.hp = 1;
      hero.scarred = true;
    }
    return;
  }

  const living = livingRoster(world, team);
  const abandoned = living.length === 0 ? 1 : 0;
  const wiped = roster(world, team).every((h) => h.state !== 'ok') ? 1 : 0;

  const rng = rngFor(world.seed, world.tick, RngDomain.PERMADEATH, hero.id);
  const p = clamp(0.05, 0.95, 0.12 + 0.3 * abandoned + 0.2 * wiped - (hero.scarred ? 0.05 : 0));

  if (rng.chance(p)) {
    killHero(world, hero);
  } else {
    hero.state = 'ok';
    hero.hp = 1;
    hero.scarred = true;
    team.morale = clamp(0, 100, team.morale - 15);
    if (rng.chance(0.2)) {
      const stat = rng.pick(['str', 'agi', 'wil'] as const);
      hero.stats[stat] = Math.max(3, hero.stats[stat] - 1);
    }
  }
}

export function killHero(world: World, hero: Hero): void {
  hero.state = 'dead';
  hero.hp = 0;
  hero.diedTick = world.tick;
  hero.diedWallMs = Date.now();
  world.dungeon.heroesSlain += 1;
  world.dungeon.notorietyMilli += 900 * 1000;

  const team = hero.teamId === null ? undefined : teamById(world, hero.teamId);
  if (team) {
    const crew = livingRoster(world, team);
    const grief = griefMultiplier(crew, hero.id);
    team.morale = clamp(0, 100, team.morale - Math.round(20 * grief) - 3 * traitCount(crew, 'superstitious'));
    team.renownMilli = Math.max(0, team.renownMilli - 60 * 1000);
    adjustStanding(team, -3);
    if (team.state === 'fleeing' || team.lastAction === 'RETREAT') fleeGrudges(world, team);

    const room = floorOf(world, team.floorId)?.rooms[team.roomIdx];
    if (room) {
      room.deaths += 1;
      if (room.deaths === 3) {
        emit(world, {
          type: 'ROOM_LANDMARK',
          teamId: team.id,
          floorId: team.floorId,
          roomId: room.id,
          payload: { room: room.name, title: roomTitle(room), deaths: room.deaths },
        });
      }
    }
  }

  world.scheduler.schedule(world.tick + 60, 'CORPSE_SWEEP', hero.id);

  emit(world, {
    type: 'HERO_DEATH',
    teamId: team?.id ?? null,
    heroId: hero.id,
    floorId: team?.floorId ?? null,
    payload: { hero: hero.name, level: hero.level, species: hero.species, className: hero.className },
  });

  if (team) {
    const alive = roster(world, team).filter((h) => h.state !== 'dead');
    const survivor = alive[0];
    if (alive.length === 1 && survivor && team.roster.length >= 3) {
      awardEpithet(world, survivor, 'lonesurvivor');
    }
    if (alive.length === 0) {
      team.state = 'disbanded';
      team.disbandedTick = world.tick;
      team.renownMilli = Math.max(0, team.renownMilli - 250 * 1000);
      const depth = floorOf(world, team.floorId)?.depth ?? 1;
      pushHistory(team, world.tick, 'wipe', `${team.name} was wiped out on floor ${depth}, to the last hand.`);
      emit(world, {
        type: 'TEAM_WIPE',
        teamId: team.id,
        floorId: team.floorId,
        payload: { team: team.name, floor: team.floorId },
      });
    }
  }
}

export function sweepCorpse(world: World, heroId: number): void {
  const hero = heroById(world, heroId);
  if (!hero || hero.state !== 'dead') return;

  const gear = itemsOf(world, hero);
  const gearValue = gear.reduce((n, i) => n + i.valueCp, 0);
  const salvaged = Math.floor(0.6 * gearValue);
  const purse = hero.goldCp;

  world.dungeon.treasuryCp += purse + salvaged;
  world.dungeon.mintedCp += salvaged;
  world.dungeon.corpseYieldCp += purse + salvaged;
  hero.goldCp = 0;

  const recovered = purse + salvaged;
  const burned = gearValue - salvaged;

  for (const item of gear) {
    item.ownerHeroId = null;
    item.ownerTeamId = null;
    item.roomId = null;
    const idx = world.items.indexOf(item);
    if (idx >= 0) world.items.splice(idx, 1);
  }
  hero.items = [];

  emit(world, {
    type: 'CORPSE_TAX_LEVIED',
    heroId: hero.id,
    teamId: hero.teamId,
    payload: { hero: hero.name, recoveredCp: recovered, burnedCp: burned },
  });
}

export function isStale(world: World, hero: Hero): boolean {
  return hero.diedTick !== null && world.tick - hero.diedTick > DAY_TICKS * 90;
}
