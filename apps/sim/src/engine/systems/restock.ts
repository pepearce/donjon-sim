import { DAY_TICKS, RngDomain, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { GUARDIAN_NAMES, MONSTERS } from '../tables.js';
import { floorOf } from '../world.js';
import { monsterFromCr } from './combat.js';
import { schemeAggressionFactor } from './dungeon.js';
import { armTrap } from './traps.js';
import type { Floor, Room, World } from '../types.js';

export const LEAN_TREASURY_CP = 20_000;
const AUSTERITY_PAYROLL_CP = 5_000;
const SHOPFRONT_DEPTH = 2;

export function payrollCp(world: World): number {
  let wages = 0;
  for (const monster of world.monsters) {
    if (monster.alive) wages += monster.wageCpPerDay;
  }
  return wages;
}

export function hiringBudgetCp(world: World): number {
  if (world.dungeon.austerity) return Infinity;
  return Math.max(AUSTERITY_PAYROLL_CP, world.dungeon.treasuryCp * 0.2);
}

export function stockRoom(world: World, floor: Floor, room: Room): void {
  const rng = rngFor(world.seed, world.tick, RngDomain.ROOM_STOCK, room.id);
  const aggression = (world.dungeon.aggressionMilli / 1000) * schemeAggressionFactor(world, floor.id);
  const pool = MONSTERS.filter((m) => m.minDepth <= floor.depth);
  if (pool.length === 0) return;

  const lean = world.dungeon.austerity || world.dungeon.treasuryCp < LEAN_TREASURY_CP;
  const isGuardianRoom = room.idx === floor.stairsRoom;
  const count = isGuardianRoom || lean ? 1 : Math.max(1, Math.round((1 + rng.int(0, 1)) * aggression));
  const cheap = [...pool].sort((a, b) => a.crBias - b.crBias || (a.name < b.name ? -1 : 1)).slice(0, 3);

  for (let i = 0; i < count; i++) {
    const archetype = isGuardianRoom
      ? (pool.filter((m) => m.guardian)[0] ?? rng.pick(pool))
      : rng.pick(world.dungeon.austerity ? cheap : pool);
    const cr = Math.max(0.5, (floor.dangerCr + archetype.crBias) * aggression);
    const monster = monsterFromCr(world, archetype.name, cr, room.id, floor.id, archetype.guardian || isGuardianRoom);
    world.monsters.push(monster);

    if (monster.guardian) {
      const nameRng = rngFor(world.seed, world.tick, RngDomain.MONSTER_PICK, monster.id);
      const titled = nameRng.pick(GUARDIAN_NAMES);
      emit(world, {
        type: 'GUARDIAN_HIRED',
        floorId: floor.id,
        roomId: room.id,
        payload: {
          monster: titled.name,
          title: titled.title,
          archetype: monster.name,
          depth: floor.depth,
          floor: floor.name,
          cr: Math.round(cr * 10) / 10,
          cp: monster.wageCpPerDay,
          wageCp: monster.wageCpPerDay,
        },
      });
    }
  }

  room.state = 'stocked';
  armTrap(world, room, floor.depth);
}

export function scheduleRestock(world: World, floor: Floor, room: Room): void {
  const rng = rngFor(world.seed, world.tick, RngDomain.RESTOCK, room.id);
  const lean = world.dungeon.treasuryCp < LEAN_TREASURY_CP ? 2 : 1;
  const lo = DAY_TICKS * (0.15 + 0.05 * (floor.depth - 1)) * lean;
  const hi = DAY_TICKS * (0.5 + 0.1 * (floor.depth - 1)) * lean;
  const delay = rng.int(Math.round(lo), Math.round(hi));
  room.restockDueTick = world.tick + delay;
  room.state = 'restocking';
  world.scheduler.schedule(room.restockDueTick, 'RESTOCK', room.id);
}

export function sweepCleared(world: World): void {
  for (const floor of world.floors) {
    for (const room of floor.rooms) {
      if (room.idx === floor.entryRoom || room.idx === floor.shopRoom) continue;
      if (room.state !== 'cleared') continue;
      if (room.restockDueTick > world.tick) continue;
      scheduleRestock(world, floor, room);
    }
  }
}

export function resolveRestock(world: World, roomId: number): void {
  for (const floor of world.floors) {
    const room = floor.rooms.find((r) => r.id === roomId);
    if (!room) continue;
    if (floor.depth > SHOPFRONT_DEPTH && payrollCp(world) > hiringBudgetCp(world)) {
      scheduleRestock(world, floor, room);
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
    if (room.idx === floor.entryRoom || room.idx === floor.shopRoom) {
      room.state = 'cleared';
      continue;
    }
    stockRoom(world, floor, room);
  }
}
