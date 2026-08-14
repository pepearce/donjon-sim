import { createHash } from 'node:crypto';
import { MAX_ROSTER, RngDomain, rngFor, type Rng, type SimEvent } from '@donjon/shared';
import { generateFloor } from '../gen/floorgen.js';
import { rollKeeperPersona } from './keeperPersona.js';
import { RingBuffer } from './ring.js';
import { Scheduler } from './scheduler.js';
import { CLASSES, GIVEN_NAMES, SPECIES, SURNAMES, TEAM_MOTTOS, TEAM_PREFIXES, TEAM_SUFFIXES, TRAITS } from './tables.js';
import { pushHistory } from './types.js';
import type { DungeonState, Floor, Hero, Item, Monster, Team, World } from './types.js';

export * from './types.js';

export const STARTING_TEAMS = 3;
export const MAX_TEAMS = 10;
export const MAX_FLOORS = 10;

export function makeHero(world: World, rng: Rng, level = 1): Hero {
  const species = rng.pick(SPECIES);
  const klass = rng.pick(CLASSES);
  const given = rng.pick(GIVEN_NAMES);
  const surname = rng.pick(SURNAMES);
  const hpMax = species.hp + klass.hp + 10 + (level - 1) * 5;
  let xp = 0;
  for (let l = 1; l < level; l++) xp += Math.round(60 * l ** 1.45);

  const hero: Hero = {
    id: world.nextHeroId++,
    name: `${given} ${surname}`,
    species: species.id,
    className: klass.id,
    primary: klass.primary,
    teamId: null,
    level,
    xp,
    hp: hpMax,
    hpMax,
    stats: { ...species.stats },
    state: 'ok',
    bleedOutTick: 0,
    kills: 0,
    scarred: false,
    rezCount: 0,
    bornTick: world.tick,
    diedTick: null,
    diedWallMs: null,
    retiredTick: null,
    goldCp: 0,
    items: [],
    traits: [],
    epithet: '',
    nemesisName: '',
    nemesisDowns: 0,
    relations: [],
  };
  const traitRng = rngFor(world.seed, world.tick, RngDomain.TRAIT, hero.id);
  hero.traits.push(traitRng.pick(TRAITS).id);
  world.heroes.push(hero);
  return hero;
}

export function makeTeam(world: World, rng: Rng, roster: Hero[]): Team {
  const usedColors = new Set(world.teams.filter((t) => t.state !== 'disbanded').map((t) => t.colorIndex));
  let colorIndex = 0;
  for (let i = 0; i < MAX_TEAMS; i++) {
    if (!usedColors.has(i)) {
      colorIndex = i;
      break;
    }
  }

  let name = `${rng.pick(TEAM_PREFIXES)} ${rng.pick(TEAM_SUFFIXES)}`;
  let guard = 0;
  while (world.teams.some((t) => t.name === name) && guard < 40) {
    name = `${rng.pick(TEAM_PREFIXES)} ${rng.pick(TEAM_SUFFIXES)}`;
    guard += 1;
  }
  if (world.teams.some((t) => t.name === name)) name = `${name} ${world.nextTeamId}`;

  const entryFloor = world.floors[0];
  const entry = entryFloor?.rooms[entryFloor.entryRoom];

  const team: Team = {
    id: world.nextTeamId++,
    name,
    motto: rng.pick(TEAM_MOTTOS),
    colorIndex,
    monogram: name
      .replace(/^The /, '')
      .split(' ')
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase(),
    state: 'delving',
    floorId: entryFloor?.id ?? 1,
    roomIdx: entryFloor?.entryRoom ?? 0,
    targetRoom: entryFloor?.entryRoom ?? 0,
    tileX: entry?.cx ?? 1,
    tileY: entry?.cy ?? 1,
    path: [],
    pathPos: 0,
    roster: roster.slice(0, MAX_ROSTER).map((h) => h.id),
    morale: 70,
    goldCp: 0,
    carriedCp: 0,
    rations: 40,
    greed: rng.int(30, 90) / 100,
    renownMilli: 0,
    peakRenownMilli: 0,
    rank: 0,
    deepestFloor: 1,
    lastAction: 'EXPLORE',
    commitUntilTick: 0,
    formedTick: world.tick,
    disbandedTick: null,
    homeboundTick: null,
    restUntilTick: 0,
    lastDeepestTick: world.tick,
    explored: new Set<string>(),
    exploredTiles: new Map<number, Uint8Array>(),
    trail: [],
    history: [],
    standing: 0,
  };

  pushHistory(team, world.tick, 'formed', `${team.name} signed articles in the tavern and paid the entry fee.`);

  for (const hero of roster.slice(0, MAX_ROSTER)) hero.teamId = team.id;
  world.teams.push(team);
  return team;
}

function initialDungeon(seed: number): DungeonState {
  const persona = rollKeeperPersona(seed);
  return {
    treasuryCp: 120_000,
    loanCp: 0,
    austerity: false,
    aggressionMilli: 1000,
    lethalityEmaMilli: 220,
    revenueEmaCp: 0,
    fameMilli: 0,
    notorietyMilli: 0,
    entryFeeCp: 500,
    tollBp: 1500,
    corpseTaxBp: 8500,
    keeperMood: 'content',
    heroesSlain: 0,
    corpseYieldCp: 0,
    rezYieldCp: 0,
    mintedCp: 0,
    sinkCp: 0,
    scheme: null,
    keeperAct: { last: '', tick: 0, text: '', cooldowns: {} },
    records: [],
    insolventDays: 0,
    keeperName: persona.name,
    keeperTrait: persona.trait,
    standing: 50,
    overseerName: '',
    gambit: null,
    lastGambitEndedTick: 0,
    loanTakenTick: 0,
    lastBigHaulTeamId: null,
    apexEpoch: 0,
    lastTriumphTick: 0,
  };
}

export function genesis(seed: number): World {
  const world: World = {
    seed,
    tick: 0,
    floors: [],
    teams: [],
    heroes: [],
    monsters: [],
    items: [],
    tavern: [],
    dungeon: initialDungeon(seed),
    scheduler: new Scheduler(),
    nextEventId: 1,
    nextHeroId: 1,
    nextTeamId: 1,
    nextMonsterId: 1,
    nextItemId: 1,
    nextSchemeId: 1,
    initialCoinCp: 0,
    pendingEvents: [],
    tailRing: new RingBuffer<SimEvent>(500),
    foreclosed: false,
  };

  world.floors.push(generateFloor(seed, 1, 0));
  world.floors.push(generateFloor(seed, 2, 0));

  const rng = rngFor(seed, 0, RngDomain.HERO_GEN, 0);
  for (let t = 0; t < STARTING_TEAMS; t++) {
    const roster = [makeHero(world, rng), makeHero(world, rng), makeHero(world, rng)];
    makeTeam(world, rng, roster);
  }

  const poolRng = rngFor(seed, 0, RngDomain.RECRUIT, 0);
  for (let i = 0; i < 8; i++) world.tavern.push(makeHero(world, poolRng).id);

  world.initialCoinCp = circulatingCoin(world);
  return world;
}

export function circulatingCoin(world: World): number {
  let total = world.dungeon.treasuryCp;
  for (const hero of world.heroes) total += hero.goldCp;
  for (const team of world.teams) total += team.goldCp + team.carriedCp;
  return total;
}

export function floorOf(world: World, floorId: number): Floor | undefined {
  return world.floors.find((f) => f.id === floorId);
}

export function heroById(world: World, id: number): Hero | undefined {
  return world.heroes.find((h) => h.id === id);
}

export function teamById(world: World, id: number): Team | undefined {
  return world.teams.find((t) => t.id === id);
}

export function roster(world: World, team: Team): Hero[] {
  const out: Hero[] = [];
  for (const id of team.roster) {
    const hero = heroById(world, id);
    if (hero) out.push(hero);
  }
  return out;
}

export function livingRoster(world: World, team: Team): Hero[] {
  return roster(world, team).filter((h) => h.state === 'ok');
}

export function monstersIn(world: World, floorId: number, roomIdx: number): Monster[] {
  const floor = floorOf(world, floorId);
  const room = floor?.rooms[roomIdx];
  if (!room) return [];
  return world.monsters.filter((m) => m.alive && m.roomId === room.id);
}

export function itemsOf(world: World, hero: Hero): Item[] {
  const out: Item[] = [];
  for (const id of hero.items) {
    const item = world.items.find((i) => i.id === id);
    if (item) out.push(item);
  }
  return out;
}

function u32(bytes: number[], v: number): void {
  const n = Math.round(v) | 0;
  bytes.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
}

export function worldDigest(w: World): string {
  const bytes: number[] = [];
  u32(bytes, w.seed);
  u32(bytes, w.tick);
  u32(bytes, w.nextEventId);
  u32(bytes, w.floors.length);
  u32(bytes, w.dungeon.treasuryCp);
  u32(bytes, w.dungeon.loanCp);
  u32(bytes, w.dungeon.heroesSlain);
  u32(bytes, w.dungeon.mintedCp);
  u32(bytes, w.dungeon.sinkCp);
  u32(bytes, w.dungeon.scheme?.id ?? 0);
  u32(bytes, w.dungeon.apexEpoch);
  u32(bytes, w.dungeon.records.length);
  let recordTotal = 0;
  for (const r of w.dungeon.records) recordTotal += r.value;
  u32(bytes, recordTotal);

  for (const t of [...w.teams].sort((a, b) => a.id - b.id)) {
    u32(bytes, t.id);
    u32(bytes, t.floorId);
    u32(bytes, t.roomIdx);
    u32(bytes, t.targetRoom);
    u32(bytes, t.tileX);
    u32(bytes, t.tileY);
    u32(bytes, t.pathPos);
    u32(bytes, t.morale);
    u32(bytes, t.goldCp);
    u32(bytes, t.carriedCp);
    u32(bytes, t.renownMilli);
    u32(bytes, t.deepestFloor);
    u32(bytes, t.state.length);
    u32(bytes, t.standing + 100);
    u32(bytes, t.history.length);
  }
  for (const h of [...w.heroes].sort((a, b) => a.id - b.id)) {
    u32(bytes, h.id);
    u32(bytes, h.level);
    u32(bytes, h.xp);
    u32(bytes, h.hp);
    u32(bytes, h.state === 'ok' ? 1 : h.state === 'downed' ? 2 : 3);
    u32(bytes, h.kills);
    u32(bytes, h.goldCp);
    u32(bytes, h.traits.length);
    u32(bytes, h.epithet.length);
    u32(bytes, h.nemesisName.length);
    u32(bytes, h.relations.length);
    let bondTotal = 0;
    for (const r of h.relations) bondTotal += r.v;
    u32(bytes, bondTotal + 600);
  }
  for (const m of [...w.monsters].sort((a, b) => a.id - b.id)) {
    u32(bytes, m.id);
    u32(bytes, m.hp);
    u32(bytes, m.alive ? 1 : 0);
    u32(bytes, m.roomId);
  }
  for (const i of [...w.items].sort((a, b) => a.id - b.id)) {
    u32(bytes, i.id);
    u32(bytes, i.valueCp);
    u32(bytes, i.ownerHeroId ?? 0);
    u32(bytes, i.roomId ?? 0);
  }
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}
