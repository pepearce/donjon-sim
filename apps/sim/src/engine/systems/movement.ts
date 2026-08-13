import { RngDomain, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { nextRoomTowards } from '../../gen/apsp.js';
import { generateFloor, roomSpot, tilePath, walkWithin } from '../../gen/floorgen.js';
import { MAX_FLOORS, floorOf, livingRoster, monstersIn } from '../world.js';
import { sapperCharge } from './combat.js';
import { doctrineFor, roomNoise } from './doctrine.js';
import { traitFrac } from './traits.js';
import { resolveTrap } from './traps.js';
import { scheduleRestock, stockFloor } from './restock.js';
import { bankLoot, payEntryFee } from './economy.js';
import { awardEpithet } from './epithets.js';
import { setRecord } from './records.js';
import { clamp, exploredKey, isWalkable, pickWeighted, pushHistory, type Floor, type Team, type World } from '../types.js';
import { markSeen } from '../fog.js';

function clearPath(team: Team): void {
  team.path = [];
  team.pathPos = 0;
}

function rivalRooms(world: World, team: Team, floor: Floor): Set<number> {
  const taken = new Set<number>();
  for (const other of world.teams) {
    if (other.id === team.id || other.state === 'disbanded') continue;
    if (other.floorId !== floor.id) continue;
    taken.add(other.roomIdx);
    taken.add(other.targetRoom);
  }
  return taken;
}

export function onStairs(floor: Floor, team: Team): boolean {
  const stairs = floor.rooms[floor.stairsRoom];
  return !!stairs && team.roomIdx === floor.stairsRoom && team.tileX === stairs.cx && team.tileY === stairs.cy;
}

export function atEntry(floor: Floor, team: Team): boolean {
  const entry = floor.rooms[floor.entryRoom];
  return !!entry && team.roomIdx === floor.entryRoom && team.tileX === entry.cx && team.tileY === entry.cy;
}

export function chooseDestination(world: World, team: Team, floor: Floor): number {
  const rng = rngFor(world.seed, world.tick, RngDomain.TEAM_DEST, team.id);
  const stocked = floor.rooms.filter((r) => r.state === 'stocked' && r.idx !== team.roomIdx);

  if (team.lastAction === 'DESCEND' || (stocked.length === 0 && floor.stairsRoom !== team.roomIdx)) {
    return floor.stairsRoom;
  }
  if (stocked.length === 0) return floor.stairsRoom;

  const reachable = stocked.filter((r) => (floor.dist[team.roomIdx * floor.rooms.length + r.idx] ?? 255) < 255);
  const pool = reachable.length > 0 ? reachable : stocked;

  const doctrine = doctrineFor(world, team);
  const bold = traitFrac(livingRoster(world, team), 'bold');
  const effCaution = doctrine.caution * (1 + world.dungeon.aggressionMilli / 2000);
  const dangerSign = bold > 0.5 ? -1 : 1;
  const rivals = rivalRooms(world, team, floor);

  const scored = pool.map((r) => {
    const dist = floor.dist[team.roomIdx * floor.rooms.length + r.idx] ?? 255;
    const value =
      -2.5 * dist +
      26 * doctrine.avarice * Math.log10(1 + r.lootCp / 100) -
      dangerSign * 6 * effCaution * (r.trapTier + 0.8 * r.deaths) -
      18 * (rivals.has(r.idx) ? 1 : 0) +
      14 * doctrine.wanderlust * (team.explored.has(exploredKey(floor.id, r.idx)) ? 0 : 1) +
      12 * roomNoise(world.seed, team.id, floor.id, r.idx);
    return { idx: r.idx, value };
  });

  scored.sort((a, b) => b.value - a.value || a.idx - b.idx);
  const top = scored.slice(0, 3);
  if (top.length === 1) return top[0]!.idx;

  const floorValue = top[top.length - 1]!.value;
  const weights = top.map((c) => c.value - floorValue + 1);
  return (pickWeighted(top, weights, rng) ?? top[0]!).idx;
}

export function repath(world: World, team: Team, floor: Floor, destination: number): void {
  const step = nextRoomTowards(floor, floor.rooms.length, team.roomIdx, destination);
  const here: [number, number] = [team.tileX, team.tileY];
  const spot = roomSpot(floor, step, team.id, world.seed);

  if (step === team.roomIdx) {
    team.targetRoom = step;
    team.path = walkWithin(floor, here, spot);
    team.pathPos = 0;
    return;
  }

  let path = tilePath(floor, team.roomIdx, step, here, spot);
  if (step !== team.roomIdx && path.length === 0) {
    path = tilePath(floor, team.roomIdx, step, here);
  }
  if (step !== team.roomIdx && path.length === 0) {
    team.targetRoom = team.roomIdx;
    clearPath(team);
    return;
  }
  team.targetRoom = step;
  team.path = path;
  team.pathPos = 0;
}

function onArrival(world: World, team: Team, floor: Floor): void {
  const room = floor.rooms[team.roomIdx];
  if (!room) return;
  room.visits += 1;
  team.explored.add(exploredKey(floor.id, room.idx));
  markSeen(team, floor, room.cx, room.cy, Math.max(room.w, room.h));

  emit(world, {
    type: 'EXPLORED',
    teamId: team.id,
    floorId: floor.id,
    roomId: room.id,
    payload: { room: room.name, depth: floor.depth },
  });

  if (team.roomIdx === floor.entryRoom) {
    bankLoot(world, team);
    payEntryFee(world, team);
    emit(world, {
      type: 'PARTY_ENTERED',
      teamId: team.id,
      floorId: floor.id,
      roomId: room.id,
      payload: { team: team.name, depth: floor.depth, floor: floor.name, size: livingRoster(world, team).length },
    });
  }

  resolveTrap(world, team, room);

  const enemies = monstersIn(world, floor.id, team.roomIdx);
  if (enemies.length > 0) {
    team.state = 'fighting';
    emit(world, {
      type: 'COMBAT_START',
      teamId: team.id,
      floorId: floor.id,
      roomId: room.id,
      payload: { room: room.name, enemies: enemies.length, lead: enemies[0]?.name ?? 'something' },
    });
    sapperCharge(world, team);
    return;
  }

  if (room.state === 'cleared' && room.restockDueTick <= world.tick) scheduleRestock(world, floor, room);

  if (onStairs(floor, team)) descend(world, team, floor);
}

export function descend(world: World, team: Team, floor: Floor): void {
  const nextDepth = floor.depth + 1;
  let next = floorOf(world, nextDepth);

  if (!next && nextDepth <= MAX_FLOORS) {
    next = generateFloor(world.seed, nextDepth, world.tick);
    world.floors.push(next);
    stockFloor(world, next.id);
  }
  if (!next) return;

  team.floorId = next.id;
  team.roomIdx = next.entryRoom;
  team.targetRoom = next.entryRoom;
  const entry = next.rooms[next.entryRoom];
  const entrySpot = roomSpot(next, next.entryRoom, team.id, world.seed);
  team.tileX = entry ? entrySpot[0] : 1;
  team.tileY = entry ? entrySpot[1] : 1;
  clearPath(team);
  team.trail.length = 0;
  team.lastAction = 'EXPLORE';
  team.commitUntilTick = world.tick + 120;
  team.morale = clamp(0, 100, team.morale + 3);

  team.explored.add(exploredKey(next.id, next.entryRoom));
  if (entry) markSeen(team, next, entry.cx, entry.cy, Math.max(entry.w, entry.h));

  if (nextDepth > team.deepestFloor) {
    team.deepestFloor = nextDepth;
    team.lastDeepestTick = world.tick;
    team.renownMilli += 15 * nextDepth * 1000;
    pushHistory(team, world.tick, 'descend', `${team.name} went down to floor ${nextDepth} for the first time.`);
    setRecord(world, 'deepest', 'deepest floor reached', nextDepth, team.name, team);
    if (nextDepth >= 4) {
      for (const hero of livingRoster(world, team).sort((a, b) => a.id - b.id)) {
        awardEpithet(world, hero, 'deep');
      }
    }
  }

  emit(world, {
    type: 'FLOOR_DESCEND',
    teamId: team.id,
    floorId: next.id,
    payload: { team: team.name, depth: nextDepth, floor: next.name },
  });
}

export function ascend(world: World, team: Team, floor: Floor): void {
  const prev = floorOf(world, floor.depth - 1);
  if (!prev) return;

  team.floorId = prev.id;
  team.roomIdx = prev.stairsRoom;
  team.targetRoom = prev.stairsRoom;
  const room = prev.rooms[prev.stairsRoom];
  const stairSpot = roomSpot(prev, prev.stairsRoom, team.id, world.seed);
  team.tileX = room ? stairSpot[0] : 1;
  team.tileY = room ? stairSpot[1] : 1;
  clearPath(team);
  team.trail.length = 0;
  team.lastAction = 'EXPLORE';
  team.commitUntilTick = world.tick + 120;
  team.explored.add(exploredKey(prev.id, prev.stairsRoom));
  if (room) markSeen(team, prev, room.cx, room.cy, Math.max(room.w, room.h));

  emit(world, {
    type: 'FLOOR_ASCEND',
    teamId: team.id,
    floorId: prev.id,
    payload: { team: team.name, depth: prev.depth, floor: prev.name },
  });
}

export function advanceTeam(world: World, team: Team): void {
  const floor = floorOf(world, team.floorId);
  if (!floor) return;

  if (!isWalkable(floor, team.tileX, team.tileY)) {
    const room = floor.rooms[team.roomIdx] ?? floor.rooms[floor.entryRoom];
    if (room) {
      team.tileX = room.cx;
      team.tileY = room.cy;
      clearPath(team);
      team.targetRoom = team.roomIdx;
    }
  }

  if (!floor.rooms[team.roomIdx]) {
    team.roomIdx = floor.entryRoom;
    team.targetRoom = floor.entryRoom;
    clearPath(team);
    const entry = floor.rooms[floor.entryRoom];
    team.tileX = entry?.cx ?? 1;
    team.tileY = entry?.cy ?? 1;
  }

  if (livingRoster(world, team).length === 0) return;

  if (team.pathPos >= team.path.length) {
    if (team.targetRoom !== team.roomIdx) {
      team.roomIdx = team.targetRoom;
      onArrival(world, team, floor);
      if (team.state === 'fighting') return;
      if (team.floorId !== floor.id) return;
    }
    const destination = chooseDestination(world, team, floor);
    repath(world, team, floor, destination);
    return;
  }

  const next = team.path[team.pathPos];
  if (!next) {
    team.pathPos = team.path.length;
    return;
  }
  if (!isWalkable(floor, next[0], next[1])) {
    clearPath(team);
    team.targetRoom = team.roomIdx;
    return;
  }
  team.tileX = next[0];
  team.tileY = next[1];
  team.pathPos += 1;
  markSeen(team, floor, team.tileX, team.tileY);
  team.trail.push([team.tileX, team.tileY]);
  if (team.trail.length > 64) team.trail.shift();
}
