import { RngDomain, defineTunables, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { MAX_TEAMS, heroById, makeHero, makeTeam, roster } from '../world.js';
import { clamp, relationTo, type Hero, type World } from '../types.js';

export const RECRUIT = defineTunables('recruit', {
  softFloorHeroes: { default: 20, min: 0, max: 1000, label: 'Hero soft floor' },
  targetHeroes: { default: 40, min: 0, max: 1000, label: 'Hero target' },
  targetTeams: { default: 7, min: 1, max: 100, label: 'Team target' },
  maxPool: { default: 20, min: 1, max: 1000, label: 'Recruit pool cap' },
});

export function livingHeroCount(world: World): number {
  return world.heroes.filter((h) => h.state !== 'dead').length;
}

export function activeTeamCount(world: World): number {
  return world.teams.filter((t) => t.state !== 'disbanded').length;
}

export function arrivals(world: World): void {
  const living = livingHeroCount(world);
  const pool = world.tavern.length;
  if (pool >= RECRUIT.maxPool) return;

  const d = world.dungeon;
  const fameNorm = d.fameMilli / (d.fameMilli + 4_000_000);
  const notorietyNorm = d.notorietyMilli / (d.notorietyMilli + 6_000_000);

  const desperate = living < RECRUIT.softFloorHeroes;
  const p = desperate
    ? 0.25
    : clamp(0, 0.25, 0.002 * (RECRUIT.targetHeroes - living) + 0.03 * fameNorm - 0.015 * notorietyNorm);

  if (p <= 0) return;
  const rng = rngFor(world.seed, world.tick, RngDomain.RECRUIT, world.nextHeroId);
  if (!rng.chance(p)) return;

  const hero = makeHero(world, rng, 1 + (rng.chance(0.15) ? 1 : 0));
  world.tavern.push(hero.id);
  emit(world, {
    type: 'RECRUIT',
    heroId: hero.id,
    payload: { hero: hero.name, species: hero.species, className: hero.className },
  });

  if (desperate && world.tick % 600 === 0) {
    emit(world, {
      type: 'KEEPER_DECREE',
      payload: { decree: 'marketing', text: 'posters go up in every village: adventurers wanted, terms generous' },
    });
  }
}

export function formTeams(world: World): void {
  const active = activeTeamCount(world);
  if (active >= MAX_TEAMS || world.tavern.length < 4) return;

  const p = clamp(0, 0.05, 0.006 * (RECRUIT.targetTeams - active));
  if (p <= 0) return;

  const rng = rngFor(world.seed, world.tick, RngDomain.TEAM_GEN, world.nextTeamId);
  if (!rng.chance(p)) return;

  const size = rng.int(3, 4);
  const picked: number[] = [];
  const anchorIdx = rng.int(0, world.tavern.length - 1);
  const [anchorId] = world.tavern.splice(anchorIdx, 1);
  if (anchorId === undefined) return;
  picked.push(anchorId);

  const anchor = heroById(world, anchorId);
  const bondRng = rngFor(world.seed, world.tick, RngDomain.RELATION, world.nextTeamId);
  for (let i = 1; i < size && world.tavern.length > 0; i++) {
    const weights = world.tavern.map((id) => Math.max(1, 100 + (anchor ? relationTo(anchor, id) : 0)));
    const total = weights.reduce((a, b) => a + b, 0);
    let point = bondRng.float() * total;
    let chosen = 0;
    for (let j = 0; j < world.tavern.length; j++) {
      point -= weights[j] ?? 0;
      if (point <= 0) {
        chosen = j;
        break;
      }
    }
    const [id] = world.tavern.splice(chosen, 1);
    if (id !== undefined) picked.push(id);
  }

  const heroes = picked
    .map((id) => heroById(world, id))
    .filter((h): h is Hero => h !== undefined);
  if (heroes.length < 3) {
    world.tavern.push(...picked);
    return;
  }

  const team = makeTeam(world, rng, heroes);
  let bank = 0;
  for (const hero of heroes) {
    const chip = Math.floor(hero.goldCp / 2);
    hero.goldCp -= chip;
    bank += chip;
  }
  if (bank < 1_200) {
    world.dungeon.mintedCp += 1_200 - bank;
    bank = 1_200;
  }
  team.goldCp = bank;

  emit(world, {
    type: 'TEAM_FORMED',
    teamId: team.id,
    payload: { team: team.name, motto: team.motto, size: heroes.length },
  });
}

export function retireStragglers(world: World): void {
  for (const team of world.teams) {
    if (team.state !== 'disbanded' || team.disbandedTick === null) continue;
    const crew = roster(world, team);
    if (crew.some((h) => h.state === 'downed')) continue;

    const survivors = crew.filter((h) => h.state !== 'dead');
    const bank = Math.round(team.goldCp) + Math.round(team.carriedCp);
    if (bank > 0) {
      team.goldCp = 0;
      team.carriedCp = 0;
      if (survivors.length > 0) {
        const share = Math.floor(bank / survivors.length);
        for (const hero of survivors) hero.goldCp += share;
        const first = survivors[0];
        if (first) first.goldCp += bank - share * survivors.length;
      } else {
        world.dungeon.treasuryCp += bank;
        emit(world, {
          type: 'TEAM_ESTATE_SEIZED',
          teamId: team.id,
          payload: { team: team.name, cp: bank },
        });
      }
    }

    for (const hero of crew) {
      if (hero.state === 'dead') continue;
      hero.teamId = null;
      if (world.tavern.includes(hero.id)) continue;
      if (world.tavern.length < RECRUIT.maxPool) {
        world.tavern.push(hero.id);
        continue;
      }
      const purse = hero.goldCp;
      world.dungeon.sinkCp += purse;
      hero.goldCp = 0;
      emit(world, {
        type: 'HERO_RETIRED',
        heroId: hero.id,
        payload: {
          hero: hero.name,
          level: hero.level,
          className: hero.className,
          goldCp: purse,
          epithet: hero.epithet,
          kills: hero.kills,
        },
      });
    }
    team.roster = [];
  }
}
