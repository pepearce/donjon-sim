import { RngDomain, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { MAX_TEAMS, makeHero, makeTeam, roster } from '../world.js';
import { clamp, type World } from '../types.js';

const SOFT_FLOOR_HEROES = 20;
const TARGET_HEROES = 40;
const TARGET_TEAMS = 7;
const MAX_POOL = 20;

export function livingHeroCount(world: World): number {
  return world.heroes.filter((h) => h.state !== 'dead').length;
}

export function activeTeamCount(world: World): number {
  return world.teams.filter((t) => t.state !== 'disbanded').length;
}

export function arrivals(world: World): void {
  const living = livingHeroCount(world);
  const pool = world.tavern.length;
  if (pool >= MAX_POOL) return;

  const d = world.dungeon;
  const fameNorm = d.fameMilli / (d.fameMilli + 4_000_000);
  const notorietyNorm = d.notorietyMilli / (d.notorietyMilli + 6_000_000);

  const desperate = living < SOFT_FLOOR_HEROES;
  const p = desperate
    ? 0.25
    : clamp(0, 0.25, 0.002 * (TARGET_HEROES - living) + 0.03 * fameNorm - 0.015 * notorietyNorm);

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

  const p = clamp(0, 0.05, 0.006 * (TARGET_TEAMS - active));
  if (p <= 0) return;

  const rng = rngFor(world.seed, world.tick, RngDomain.TEAM_GEN, world.nextTeamId);
  if (!rng.chance(p)) return;

  const size = rng.int(3, 4);
  const picked: number[] = [];
  for (let i = 0; i < size && world.tavern.length > 0; i++) {
    const idx = rng.int(0, world.tavern.length - 1);
    const [id] = world.tavern.splice(idx, 1);
    if (id !== undefined) picked.push(id);
  }

  const heroes = picked
    .map((id) => world.heroes.find((h) => h.id === id))
    .filter((h): h is NonNullable<typeof h> => h !== undefined);
  if (heroes.length < 3) {
    world.tavern.push(...picked);
    return;
  }

  const team = makeTeam(world, rng, heroes);
  team.goldCp = 1_200;
  world.dungeon.mintedCp += 1_200;

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

    for (const hero of crew) {
      if (hero.state === 'dead') continue;
      hero.teamId = null;
      if (!world.tavern.includes(hero.id) && world.tavern.length < MAX_POOL) world.tavern.push(hero.id);
    }
    team.roster = [];
  }
}
