import { emit } from './emit.js';
import { stockFloor } from './systems/restock.js';
import { genesis } from './world.js';
import type { World } from './types.js';

export function newWorld(seed: number): World {
  const world = genesis(seed);
  for (const floor of world.floors) stockFloor(world, floor.id);
  emit(world, {
    type: 'WORLD_INIT',
    floorId: world.floors[0]?.id ?? 1,
    payload: {
      seed,
      floors: world.floors.length,
      rooms: world.floors.reduce((n, f) => n + f.rooms.length, 0),
      teams: world.teams.length,
    },
  });
  return world;
}
