import {
  DAY_TICKS,
  PROTOCOL_VERSION,
  TICK_MS,
  dayOf,
  watchAt,
  type EventDTO,
  type FloorIndexEntry,
  type FloorMapDTO,
  type HeroDetailDTO,
  type KeeperPublic,
  type KeeperSchemePublic,
  type LeaderboardRowDTO,
  type MemorialEntryDTO,
  type MonsterPublic,
  type RecordRowDTO,
  type SnapshotDTO,
  type TeamDetailDTO,
  type TeamPublic,
  type TokenPublic,
  type Watch,
} from '@donjon/shared';
import { narrate, type LoadedPack } from '@donjon/content';
import { EPOCH } from '../epoch.js';
import { MONSTERS } from '../engine/tables.js';
import { lineOf } from '../engine/systems/formation.js';
import { RARITY_NAMES, floorOf, heroById, itemsOf, roomTitle, roster, xpToNext } from '../engine/world.js';
import type { Floor, Hero, World } from '../engine/types.js';

let activePack: LoadedPack | null = null;

export function setPack(pack: LoadedPack | null): void {
  activePack = pack;
}

export function getPack(): LoadedPack | null {
  return activePack;
}

export function projectFloorMap(world: World, floorId: number): FloorMapDTO | null {
  const floor = floorOf(world, floorId);
  if (!floor) return null;
  return {
    id: floor.id,
    depth: floor.depth,
    name: floor.name,
    width: floor.width,
    height: floor.height,
    tiles: Buffer.from(floor.tiles).toString('base64'),
    rooms: floor.rooms.map((r) => ({
      id: r.id,
      idx: r.idx,
      name: r.name,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      cx: r.cx,
      cy: r.cy,
      title: roomTitle(r),
      deaths: r.deaths,
    })),
    entryRoom: floor.entryRoom,
    stairsRoom: floor.stairsRoom,
    hearthRoom: floor.hearthRoom,
    shopRoom: floor.shopRoom,
  };
}

export function projectTeams(world: World): TeamPublic[] {
  return world.teams
    .filter((t) => t.state !== 'disbanded')
    .map((team) => {
      const floor = floorOf(world, team.floorId);
      return {
        id: team.id,
        name: team.name,
        motto: team.motto,
        monogram: team.monogram,
        colorIndex: team.colorIndex,
        state: team.state,
        floorId: team.floorId,
        roomIdx: team.roomIdx,
        roomName: floor?.rooms[team.roomIdx]?.name ?? 'nowhere',
        morale: Math.round(team.morale),
        goldCp: Math.round(team.goldCp + team.carriedCp),
        roomsExplored: Math.round(team.renownMilli / 1000),
        standing: Math.round(team.standing),
        renown: Math.round(team.renownMilli / 1000),
        deepestFloor: team.deepestFloor,
        carriedCp: Math.round(team.carriedCp),
        heroes: roster(world, team).map((h) => ({
          id: h.id,
          name: h.name,
          species: h.species,
          className: h.className,
          level: h.level,
          hp: Math.round(h.hp),
          hpMax: Math.round(h.hpMax),
          alive: h.state === 'ok',
          line: lineOf(h),
          state: h.state,
          kills: h.kills,
          traits: h.traits.slice(),
          epithet: h.epithet,
          nemesis: h.nemesisName,
          scarred: h.scarred,
        })),
      };
    });
}

function projectHeroDetail(world: World, h: Hero): HeroDetailDTO {
  return {
    id: h.id,
    name: h.name,
    species: h.species,
    className: h.className,
    level: h.level,
    hp: Math.round(h.hp),
    hpMax: Math.round(h.hpMax),
    alive: h.state === 'ok',
    line: lineOf(h),
    state: h.state,
    kills: h.kills,
    traits: h.traits.slice(),
    epithet: h.epithet,
    nemesis: h.nemesisName,
    scarred: h.scarred,
    xp: h.xp,
    xpToNext: xpToNext(h.level),
    stats: { str: h.stats.str, agi: h.stats.agi, wil: h.stats.wil },
    bornTick: h.bornTick,
    relations: h.relations.map((r) => ({
      id: r.id,
      name: heroById(world, r.id)?.name ?? 'a stranger',
      v: r.v,
    })),
    nemesisDowns: h.nemesisDowns,
    items: itemsOf(world, h).map((i) => ({
      name: i.name,
      rarity: RARITY_NAMES[i.rarity] ?? 'common',
      valueCp: Math.round(i.valueCp),
      atk: i.atk,
      def: i.def,
      dr: i.dr,
    })),
    goldCp: Math.round(h.goldCp),
  };
}

export function projectTeamDetail(world: World, teamId: number): TeamDetailDTO | null {
  const team = world.teams.find((t) => t.id === teamId);
  if (!team) return null;
  return {
    id: team.id,
    name: team.name,
    motto: team.motto,
    standing: Math.round(team.standing),
    greed: team.greed,
    rations: team.rations,
    carriedCp: Math.round(team.carriedCp),
    formedTick: team.formedTick,
    history: team.history.map((h) => ({ t: h.t, k: h.k, s: h.s })),
    heroes: roster(world, team).map((h) => projectHeroDetail(world, h)),
  };
}

export function projectTokens(world: World): TokenPublic[] {
  return world.teams
    .filter((t) => t.state !== 'disbanded')
    .map((team) => {
      const crew = roster(world, team);
      const hp = crew.reduce((sum, h) => sum + h.hp, 0);
      const hpMax = crew.reduce((sum, h) => sum + h.hpMax, 0) || 1;
      return {
        id: team.id,
        floorId: team.floorId,
        x: team.tileX,
        y: team.tileY,
        trail: team.trail.map(([x, y]) => [x, y] as [number, number]),
        colorIndex: team.colorIndex,
        monogram: team.monogram,
        hp: Math.round((hp / hpMax) * 100),
        alive: crew.filter((h) => h.state === 'ok').length,
        flags: team.state === 'fighting' ? 1 : team.state === 'fleeing' ? 2 : 0,
      };
    });
}

const NUM = (v: string | number | undefined): number => Number(v ?? 0);
const STR = (v: string | number | undefined): string => String(v ?? '');

export function describeEvent(
  world: World,
  type: string,
  payload: Record<string, string | number>,
  teamId: number | null,
): string {
  const team = world.teams.find((t) => t.id === teamId);
  const who = team?.name ?? 'Someone';
  switch (type) {
    case 'EXPLORED':
      return `${who} entered ${STR(payload['room'])}`;
    case 'COMBAT_START':
      return `${who} met ${NUM(payload['enemies'])} of the staff in ${STR(payload['room'])}`;
    case 'COMBAT_ROUND':
      return `${who} traded ${NUM(payload['damage'])} damage`;
    case 'COMBAT_END':
      return `${who} finished the argument`;
    case 'MONSTER_DOWN':
      return `${STR(payload['hero'])} felled a ${STR(payload['monster'])}`;
    case 'ROOM_CLEARED':
      return `${who} cleared ${STR(payload['room'])}`;
    case 'HERO_DOWN':
      return `${STR(payload['hero'])} went down to a ${STR(payload['source'])}`;
    case 'HERO_DEATH':
      return `${STR(payload['hero'])}, level ${NUM(payload['level'])} ${STR(payload['className'])}, died`;
    case 'TEAM_WIPE':
      return `${STR(payload['team'])} was wiped out on floor ${NUM(payload['floor'])}`;
    case 'TRAP_SPRUNG':
      return `${STR(payload['hero'])} found ${STR(payload['trap'])} the hard way (${NUM(payload['damage'])})`;
    case 'TRAP_DISARMED':
      return `${STR(payload['hero'])} defused ${STR(payload['trap'])}`;
    case 'LOOT_FOUND':
      return `${who} took ${NUM(payload['coin'])}cp${payload['item'] ? ` and a ${STR(payload['item'])}` : ''}`;
    case 'HERO_LEVEL_UP':
      return `${STR(payload['hero'])} reached level ${NUM(payload['level'])}`;
    case 'FLOOR_DESCEND':
      return `${STR(payload['team'])} descended to ${STR(payload['floor'])}`;
    case 'FLOOR_ASCEND':
      return `${STR(payload['team'])} climbed back up to ${STR(payload['floor'])}`;
    case 'PARTY_EXITED':
      return `${STR(payload['team'])} walked out of floor ${NUM(payload['depth'])}`;
    case 'TEAM_FORMED':
      return `${STR(payload['team'])} formed — “${STR(payload['motto'])}”`;
    case 'TEAM_DISBANDED':
      return `${STR(payload['team'])} disbanded: ${STR(payload['reason'])}`;
    case 'RECRUIT':
      return `${STR(payload['hero'])}, a ${STR(payload['species'])} ${STR(payload['className'])}, signed the waiver`;
    case 'TOLL_PAID':
      return `${who} banked ${NUM(payload['carriedCp'])}cp (toll ${NUM(payload['tollCp'])}, Khan ${NUM(payload['khanCp'])})`;
    case 'ENTRY_FEE_PAID':
      return `${STR(payload['team'])} paid ${NUM(payload['cp'])}cp at the door`;
    case 'WAGE_PAID':
      return `The Keeper paid ${NUM(payload['cp'])}cp in wages to ${NUM(payload['staff'])} staff`;
    case 'KEEPER_DECREE':
      return `Keeper's decree: ${STR(payload['text'])}`;
    case 'KHAN_LOAN':
      return `The Grand Khan's loan of ${NUM(payload['cp'])}cp was ${STR(payload['action'])}`;
    case 'REST':
      return `${STR(payload['team'])} rested, ${NUM(payload['cp'])}cp of poultices`;
    case 'CORPSE_TAX_LEVIED': {
      if (payload['estateCp'] === undefined) {
        return `The Keeper recovered ${NUM(payload['recoveredCp'])}cp from ${STR(payload['hero'])}`;
      }
      const estate = NUM(payload['estateCp']);
      const widow = NUM(payload['widowCp']);
      if (estate <= 0) return `The Keeper found nothing worth taking from ${STR(payload['hero'])}`;
      if (widow <= 0) {
        return `The Keeper took all ${estate}cp of ${STR(payload['hero'])}'s estate`;
      }
      return `The Keeper taxed ${NUM(payload['taxCp'])}cp from ${STR(payload['hero'])}'s ${estate}cp estate, ${widow}cp to the crew`;
    }
    case 'DUNGEON_RESTOCK':
      return `${STR(payload['room'])} was restocked`;
    case 'WORLD_INIT':
      return `The dungeon opens for business: ${NUM(payload['floors'])} floors, ${NUM(payload['rooms'])} rooms`;
    case 'DUNGEON_DORMANCY':
      return `The dungeon was dormant for ${Math.round(NUM(payload['dormancyMs']) / 1000)}s`;
    case 'HERO_EPITHET_GAINED':
      return `${STR(payload['hero'])} is now known as ${STR(payload['epithet'])}`;
    case 'HERO_NEMESIS_SET':
      return `${STR(payload['hero'])} will not forget that ${STR(payload['monster'])}`;
    case 'HERO_NEMESIS_SLAIN':
      return `${STR(payload['hero'])} settled the account with ${STR(payload['monster'])}`;
    case 'HERO_BOND_FORMED':
      return `${STR(payload['hero'] ?? payload['a'])} and ${STR(payload['other'] ?? payload['b'])} owe each other their lives`;
    case 'HERO_GRUDGE_FORMED':
      return `${STR(payload['hero'] ?? payload['a'])} has not forgiven ${STR(payload['other'] ?? payload['b'])}`;
    case 'KEEPER_SCHEME_SET':
      return `The Keeper opened ${STR(payload['name'])} against ${STR(payload['team'])} (${STR(payload['kind'])}, ${NUM(payload['days'])} days)`;
    case 'KEEPER_SCHEME_ENDED':
      return `${STR(payload['name'])} against ${STR(payload['team'])} ${STR(payload['outcome']) === 'won' ? 'succeeded' : 'came to nothing'}`;
    case 'ROOM_LANDMARK':
      return `${STR(payload['room'])} is now called ${STR(payload['title'])} after ${NUM(payload['deaths'])} deaths`;
    case 'SHOP_TRADE':
      return payload['item']
        ? `${STR(payload['team'])} bought ${STR(payload['item'])} at ${STR(payload['shop'])} for ${NUM(payload['cp'])}cp`
        : `${STR(payload['team'])} bought ${NUM(payload['rations'])} rations at ${STR(payload['shop'])} for ${NUM(payload['cp'])}cp`;
    case 'RECORD_SET':
      return `${STR(payload['holder'])} of ${STR(payload['team'])} set a record: ${STR(payload['label'])} ${NUM(payload['value'])}`;
    case 'HERO_RETIRED':
      return `${STR(payload['hero'])} filed for retirement with ${NUM(payload['goldCp'])}cp`;
    case 'GUARDIAN_HIRED':
      return `The Keeper hired ${STR(payload['monster'])} to hold floor ${NUM(payload['depth'])}`;
    case 'PARTY_ENTERED':
      return `${STR(payload['team'])} walked into floor ${NUM(payload['depth'])}`;
    case 'HERO_AID':
      return payload['saved']
        ? `${STR(payload['hero'])} dragged ${STR(payload['ally'])} back from the brink`
        : `${STR(payload['hero'])} patched ${STR(payload['ally'])} up for ${NUM(payload['amount'])}`;
    case 'HERO_SHIELDED':
      return `${STR(payload['hero'])} took the ${STR(payload['monster'])}'s blow meant for ${STR(payload['ward'])}`;
    case 'HERO_RIPOSTE':
      return `${STR(payload['hero'])} felled the ${STR(payload['monster'])} and kept swinging`;
    case 'HERO_ARC':
      return `${STR(payload['hero'])}'s working arced from the ${STR(payload['monster'])} to the ${STR(payload['other'])} for ${NUM(payload['damage'])}`;
    case 'HERO_BLAST':
      return `${STR(payload['hero'])} opened the room with a charge, ${NUM(payload['damage'])} across ${NUM(payload['hit'])} of the staff`;
    case 'HERO_SKIM':
      return `${STR(payload['hero'])} skimmed ${NUM(payload['cp'])}cp off the ${STR(payload['monster'])}`;
    case 'STAFF_QUIT':
      return `${NUM(payload['count'])} of the staff walked off the job unpaid`;
    case 'KHAN_FORECLOSURE':
      return `The Grand Khan foreclosed on the dungeon after ${NUM(payload['days'])} days of insolvency, ${NUM(payload['debtCp'])}cp outstanding`;
    default:
      return `${type} ${JSON.stringify(payload)}`;
  }
}

const recentByType = new Map<string, string[]>();

export function narrateEvent(
  world: World,
  type: string,
  payload: Record<string, string | number>,
  teamId: number | null,
  eventId: number,
  tick: number,
): string {
  const pack = getPack();
  if (!pack) return describeEvent(world, type, payload, teamId);

  const team = world.teams.find((t) => t.id === teamId);
  const env: Record<string, string | number> = { ...payload };
  if (team && env['team'] === undefined) env['team'] = team.name;

  const recent = recentByType.get(type) ?? [];
  const result = narrate({
    eventType: type,
    eventId,
    worldSeed: world.seed,
    tick,
    env,
    watch: watchAt(tick) as Watch,
    recentTemplateIds: recent,
    pack,
  });

  if (!result.text) return describeEvent(world, type, payload, teamId);

  recent.push(result.templateId);
  if (recent.length > 24) recent.shift();
  recentByType.set(type, recent);

  return result.text;
}

export function projectEvents(world: World, limit: number): EventDTO[] {
  return world.tailRing.last(limit).map((e) => ({
    id: e.id,
    tick: e.tick,
    type: e.type,
    severity: e.severity,
    teamId: e.teamId,
    heroId: e.heroId,
    roomId: e.roomId,
    text: narrateEvent(world, e.type, e.payload, e.teamId, e.id, e.tick),
  }));
}

export function projectFloorIndex(world: World): FloorIndexEntry[] {
  return world.floors.map((floor: Floor) => ({
    id: floor.id,
    depth: floor.depth,
    name: floor.name,
    roomCount: floor.rooms.length,
    teamCount: world.teams.filter((t) => t.state !== 'disbanded' && t.floorId === floor.id).length,
    discovered: true,
  }));
}

const KIND_BY_NAME = new Map(MONSTERS.map((m) => [m.name, m.id]));

export function projectMonsters(world: World): MonsterPublic[] {
  const out: MonsterPublic[] = [];
  const perRoom = new Map<number, number>();
  for (const m of world.monsters) {
    if (!m.alive) continue;
    const floor = floorOf(world, m.floorId);
    const room = floor?.rooms.find((r) => r.id === m.roomId);
    if (!floor || !room) continue;
    const n = perRoom.get(room.id) ?? 0;
    perRoom.set(room.id, n + 1);
    const ring = [
      [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1],
    ][n % 9] ?? [0, 0];
    out.push({
      id: m.id,
      floorId: m.floorId,
      roomIdx: room.idx,
      x: Math.max(room.x, Math.min(room.x + room.w - 1, room.cx + (ring[0] ?? 0))),
      y: Math.max(room.y, Math.min(room.y + room.h - 1, room.cy + (ring[1] ?? 0))),
      name: m.name,
      kindId: KIND_BY_NAME.get(m.name) ?? 'unknown',
      cr: Math.round(m.cr * 10) / 10,
      hp: Math.round(m.hp),
      hpMax: Math.round(m.hpMax),
      guardian: m.guardian,
    });
  }
  return out;
}

function projectScheme(world: World): KeeperSchemePublic | null {
  const scheme = world.dungeon.scheme;
  if (!scheme) return null;
  const target = world.teams.find((t) => t.id === scheme.targetTeamId);
  return {
    id: scheme.id,
    kind: scheme.kind,
    name: scheme.name,
    teamId: scheme.targetTeamId,
    teamName: target?.name ?? '',
    goal: Math.round(scheme.goal),
    progress: Math.round(scheme.progress),
    startedTick: scheme.startedTick,
    deadlineTick: scheme.deadlineTick,
    daysLeft: Math.max(0, Math.ceil((scheme.deadlineTick - world.tick) / DAY_TICKS)),
  };
}

function projectRecords(world: World): RecordRowDTO[] {
  return world.dungeon.records.map((r) => ({
    kind: r.kind,
    label: r.label,
    value: Math.round(r.value),
    holder: r.holder,
    teamName: r.teamName,
    tick: r.tick,
  }));
}

export function projectKeeper(world: World): KeeperPublic {
  const d = world.dungeon;
  return {
    name: '',
    trait: '',
    standing: 50,
    rung: 'good',
    overseer: false,
    overseerName: '',
    gambit: null,
    treasuryCp: Math.round(d.treasuryCp),
    loanCp: Math.round(d.loanCp),
    austerity: d.austerity,
    mood: d.keeperMood,
    aggression: Math.round(d.aggressionMilli) / 1000,
    entryFeeCp: d.entryFeeCp,
    tollBp: d.tollBp,
    corpseTaxBp: d.corpseTaxBp,
    heroesSlain: d.heroesSlain,
    staff: world.monsters.filter((m) => m.alive).length,
    fame: Math.round(d.fameMilli / 1000),
    notoriety: Math.round(d.notorietyMilli / 1000),
    decree: world.tailRing
      .last(200)
      .filter((e) => e.type === 'KEEPER_DECREE')
      .map((e) => String(e.payload['text'] ?? ''))
      .pop() ?? '',
    lastAct: d.keeperAct.last,
    lastActText: d.keeperAct.text,
    lastActTick: d.keeperAct.tick,
    scheme: projectScheme(world),
    records: projectRecords(world),
  };
}

export function projectLeaderboard(world: World): LeaderboardRowDTO[] {
  return world.teams
    .filter((t) => t.state !== 'disbanded')
    .slice()
    .sort(
      (a, b) =>
        b.renownMilli - a.renownMilli ||
        b.deepestFloor - a.deepestFloor ||
        b.goldCp - a.goldCp ||
        a.id - b.id,
    )
    .slice(0, 12)
    .map((team, i) => ({
      rank: i + 1,
      teamId: team.id,
      name: team.name,
      monogram: team.monogram,
      colorIndex: team.colorIndex,
      renown: Math.round(team.renownMilli / 1000),
      deepestFloor: team.deepestFloor,
      goldCp: Math.round(team.goldCp + team.carriedCp),
      alive: roster(world, team).filter((h) => h.state === 'ok').length,
      state: team.state,
    }));
}

export function projectMemorial(world: World, limit: number): MemorialEntryDTO[] {
  return world.heroes
    .filter((h) => h.state === 'dead' && h.diedTick !== null)
    .sort((a, b) => (b.diedTick ?? 0) - (a.diedTick ?? 0) || b.id - a.id)
    .slice(0, limit)
    .map((h) => ({
      id: h.id,
      name: h.name,
      species: h.species,
      className: h.className,
      level: h.level,
      diedTick: h.diedTick ?? 0,
      kills: h.kills,
      teamName: world.teams.find((t) => t.id === h.teamId)?.name ?? 'no colours',
    }));
}

export function projectSnapshot(world: World, seq: number, speed: number): SnapshotDTO {
  return {
    v: PROTOCOL_VERSION,
    epoch: EPOCH,
    seq,
    tick: world.tick,
    ts: Date.now(),
    dt: TICK_MS / speed,
    world: {
      tick: world.tick,
      day: dayOf(world.tick),
      watch: watchAt(world.tick),
      seed: world.seed,
      status: world.foreclosed ? 'foreclosed' : 'running',
    },
    floors: projectFloorIndex(world),
    teams: projectTeams(world),
    tokens: projectTokens(world),
    events: projectEvents(world, 60),
    casualties: world.dungeon.heroesSlain,
    keeper: projectKeeper(world),
    leaderboard: projectLeaderboard(world),
    memorial: projectMemorial(world, 12),
    heroesLiving: world.heroes.filter((h) => h.state !== 'dead').length,
    tavernSize: world.tavern.length,
    monsters: projectMonsters(world),
  };
}
