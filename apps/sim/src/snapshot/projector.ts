import {
  PROTOCOL_VERSION,
  TICK_MS,
  dayOf,
  watchAt,
  type EventDTO,
  type FloorIndexEntry,
  type FloorMapDTO,
  type KeeperPublic,
  type LeaderboardRowDTO,
  type MemorialEntryDTO,
  type MonsterPublic,
  type SnapshotDTO,
  type TeamPublic,
  type TokenPublic,
  type Watch,
} from '@donjon/shared';
import { narrate, type LoadedPack } from '@donjon/content';
import { floorOf, roster } from '../engine/world.js';
import type { Floor, World } from '../engine/types.js';

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
    })),
    entryRoom: floor.entryRoom,
    stairsRoom: floor.stairsRoom,
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
        heroes: roster(world, team).map((h) => ({
          id: h.id,
          name: h.name,
          species: h.species,
          className: h.className,
          level: h.level,
          hp: Math.round(h.hp),
          hpMax: Math.round(h.hpMax),
          alive: h.state === 'ok',
        })),
      };
    });
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
    case 'CORPSE_TAX_LEVIED':
      return `The Keeper recovered ${NUM(payload['recoveredCp'])}cp from ${STR(payload['hero'])}`;
    case 'DUNGEON_RESTOCK':
      return `${STR(payload['room'])} was restocked`;
    case 'WORLD_INIT':
      return `The dungeon opens for business: ${NUM(payload['floors'])} floors, ${NUM(payload['rooms'])} rooms`;
    case 'DUNGEON_DORMANCY':
      return `The dungeon was dormant for ${Math.round(NUM(payload['dormancyMs']) / 1000)}s`;
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
      cr: Math.round(m.cr * 10) / 10,
      hp: Math.round(m.hp),
      hpMax: Math.round(m.hpMax),
      guardian: m.guardian,
    });
  }
  return out;
}

export function projectKeeper(world: World): KeeperPublic {
  const d = world.dungeon;
  return {
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
    seq,
    tick: world.tick,
    ts: Date.now(),
    dt: TICK_MS / speed,
    world: {
      tick: world.tick,
      day: dayOf(world.tick),
      watch: watchAt(world.tick),
      seed: world.seed,
      status: 'running',
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
