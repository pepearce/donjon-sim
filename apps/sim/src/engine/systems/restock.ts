import { DAY_TICKS, RngDomain, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { MONSTERS } from '../tables.js';
import { floorOf } from '../world.js';
import { monsterFromCr } from './combat.js';
import { armTrap } from './traps.js';
import type { Floor, Room, World } from '../types.js';

export function stockRoom(world: World, floor: Floor, room: Room): void {
  const rng = rngFor(world.seed, world.tick, RngDomain.ROOM_STOCK, room.id);
  const aggression = world.dungeon.aggressionMilli / 1000;
  const pool = MONSTERS.filter((m) => m.minDepth <= floor.depth);
  if (pool.length === 0) return;

  const isGuardianRoom = room.idx === floor.stairsRoom;
  const count = isGuardianRoom ? 1 : Math.max(1, Math.round((1 + rng.int(0, 1)) * aggression));

  for (let i = 0; i < count; i++) {
    const archetype = isGuardianRoom
      ? (pool.filter((m) => m.guardian)[0] ?? rng.pick(pool))
      : rng.pick(pool);
    const cr = Math.max(0.5, (floor.dangerCr + archetype.crBias) * aggression);
    const monster = monsterFromCr(world, archetype.name, cr, room.id, floor.id, archetype.guardian || isGuardianRoom);
    world.monsters.push(monster);
  }

  room.state = 'stocked';
  armTrap(world, room, floor.depth);
}

export function scheduleRestock(world: World, room: Room): void {
  const rng = rngFor(world.seed, world.tick, RngDomain.RESTOCK, room.id);
  const delay = rng.int(Math.round(DAY_TICKS * 0.25), Math.round(DAY_TICKS * 0.9));
  room.restockDueTick = world.tick + delay;
  room.state = 'restocking';
  world.scheduler.schedule(room.restockDueTick, 'RESTOCK', room.id);
}

export function resolveRestock(world: World, roomId: number): void {
  for (const floor of world.floors) {
    const room = floor.rooms.find((r) => r.id === roomId);
    if (!room) continue;
    if (world.dungeon.austerity && room.idx !== floor.stairsRoom) {
      room.state = 'cleared';
      return;
    }
    stockRoom(world, floor, room);
    emit(world, {
      type: 'DUNGEON_RESTOCK',
      floorId: floor.id,
      roomId: room.id,
      payload: { room: room.name, depth: floor.depth },
    });
    return;
  }
}

export function stockFloor(world: World, floorId: number): void {
  const floor = floorOf(world, floorId);
  if (!floor) return;
  for (const room of floor.rooms) {
    if (room.idx === floor.entryRoom) {
      room.state = 'cleared';
      continue;
    }
    stockRoom(world, floor, room);
  }
}
