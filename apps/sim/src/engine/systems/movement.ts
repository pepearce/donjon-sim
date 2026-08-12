import { RngDomain, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { nextRoomTowards } from '../../gen/apsp.js';
import { generateFloor, tilePath } from '../../gen/floorgen.js';
import { MAX_FLOORS, floorOf, livingRoster, monstersIn } from '../world.js';
import { resolveTrap } from './traps.js';
import { scheduleRestock, stockFloor } from './restock.js';
import { bankLoot, payEntryFee } from './economy.js';
import { TILE_WALL, clamp, exploredKey, type Floor, type Team, type World } from '../types.js';
import { markSeen } from '../fog.js';

export function chooseDestination(world: World, team: Team, floor: Floor): number {
  const rng = rngFor(world.seed, world.tick, RngDomain.TEAM_AI, team.id);
  const stocked = floor.rooms.filter((r) => r.state === 'stocked' && r.idx !== team.roomIdx);

  if (team.lastAction === 'DESCEND' || (stocked.length === 0 && floor.stairsRoom !== team.roomIdx)) {
    return floor.stairsRoom;
  }
  if (stocked.length > 0) {
    const reachable = stocked.filter((r) => (floor.dist[team.roomIdx * floor.rooms.length + r.idx] ?? 255) < 255);
    const pool = reachable.length > 0 ? reachable : stocked;
    const nearest = pool.reduce((best, r) => {
      const dr = floor.dist[team.roomIdx * floor.rooms.length + r.idx] ?? 255;
      const db = floor.dist[team.roomIdx * floor.rooms.length + best.idx] ?? 255;
      return dr < db ? r : best;
    }, pool[0]!);
    return rng.chance(0.7) ? nearest.idx : rng.pick(pool).idx;
  }
  return floor.stairsRoom;
}

export function repath(world: World, team: Team, floor: Floor, destination: number): void {
  const step = nextRoomTowards(floor, floor.rooms.length, team.roomIdx, destination);
  team.targetRoom = step;
  team.path = tilePath(floor, team.roomIdx, step);
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
    return;
  }

  if (room.state === 'cleared' && room.restockDueTick <= world.tick) scheduleRestock(world, room);

  if (team.roomIdx === floor.stairsRoom) descend(world, team, floor);
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
  team.tileX = entry?.cx ?? 1;
  team.tileY = entry?.cy ?? 1;
  team.path = [];
  team.pathPos = 0;
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
  team.tileX = room?.cx ?? 1;
  team.tileY = room?.cy ?? 1;
  team.path = [];
  team.pathPos = 0;
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

  const here = floor.tiles[team.tileY * floor.width + team.tileX];
  if (here === undefined || here === TILE_WALL) {
    const room = floor.rooms[team.roomIdx] ?? floor.rooms[floor.entryRoom];
    if (room) {
      team.tileX = room.cx;
      team.tileY = room.cy;
      team.path = [];
      team.pathPos = 0;
      team.targetRoom = team.roomIdx;
    }
  }

  if (!floor.rooms[team.roomIdx]) {
    team.roomIdx = floor.entryRoom;
    team.targetRoom = floor.entryRoom;
    team.path = [];
    team.pathPos = 0;
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
  team.tileX = next[0];
  team.tileY = next[1];
  team.pathPos += 1;
  markSeen(team, floor, team.tileX, team.tileY);
  team.trail.push([team.tileX, team.tileY]);
  if (team.trail.length > 64) team.trail.shift();
}
