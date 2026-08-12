import { describe, expect, it } from 'vitest';
import { step } from '../src/engine/step.js';
import { newWorld } from '../src/engine/setup.js';
import { generateFloor, tilePath } from '../src/gen/floorgen.js';
import { nextRoomTowards } from '../src/gen/apsp.js';
import { advanceTeam } from '../src/engine/systems/movement.js';
import { isWalkable } from '../src/engine/types.js';

const SEED = 0xd0f0a;

describe('teams stay on walkable tiles', () => {
  it('tilePath never returns a wall tile for any pair of rooms', () => {
    for (let depth = 1; depth <= 6; depth++) {
      const floor = generateFloor(SEED, depth, 0);
      const n = floor.rooms.length;
      for (let from = 0; from < n; from++) {
        for (let to = 0; to < n; to++) {
          for (const [x, y] of tilePath(floor, from, to)) {
            expect(isWalkable(floor, x, y)).toBe(true);
          }
        }
      }
    }
  });

  it('every nextHop step yields a walkable path', () => {
    for (let depth = 1; depth <= 6; depth++) {
      const floor = generateFloor(SEED, depth, 0);
      const n = floor.rooms.length;
      for (let from = 0; from < n; from++) {
        for (let dest = 0; dest < n; dest++) {
          const step = nextRoomTowards(floor, n, from, dest);
          for (const [x, y] of tilePath(floor, from, step)) {
            expect(isWalkable(floor, x, y)).toBe(true);
          }
        }
      }
    }
  });

  it('no team ever occupies a non-walkable tile over a long run', () => {
    const world = newWorld(SEED);
    for (let i = 0; i < 5_000; i++) {
      step(world);
      for (const team of world.teams) {
        if (team.state === 'disbanded') continue;
        const floor = world.floors.find((f) => f.id === team.floorId);
        if (!floor) continue;
        expect(isWalkable(floor, team.tileX, team.tileY)).toBe(true);
      }
    }
  });

  it('refuses to step onto a wall when the path is corrupted', () => {
    const world = newWorld(SEED);
    for (let i = 0; i < 200; i++) step(world);

    const team = world.teams.find((t) => t.state === 'delving' && t.path.length > 0);
    expect(team).toBeDefined();
    if (!team) return;

    const floor = world.floors.find((f) => f.id === team.floorId);
    expect(floor).toBeDefined();
    if (!floor) return;

    let wall: [number, number] | null = null;
    for (let y = 0; y < floor.height && !wall; y++) {
      for (let x = 0; x < floor.width; x++) {
        if (!isWalkable(floor, x, y)) {
          wall = [x, y];
          break;
        }
      }
    }
    expect(wall).not.toBeNull();
    if (!wall) return;

    team.path = [wall];
    team.pathPos = 0;
    advanceTeam(world, team);

    expect([team.tileX, team.tileY]).not.toEqual(wall);
    expect(isWalkable(floor, team.tileX, team.tileY)).toBe(true);
  });
});
