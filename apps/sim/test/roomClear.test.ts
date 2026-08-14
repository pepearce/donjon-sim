import { describe, expect, it } from 'vitest';
import { newWorld } from '../src/engine/setup.js';
import { step } from '../src/engine/step.js';
import { VAULT_DEPTH, monstersIn } from '../src/engine/world.js';

const SEED = 0x51235;

describe('room clearing', () => {
  it('never leaves a room stocked but empty, baiting teams into loops', () => {
    const world = newWorld(SEED);
    const streaks = new Map<number, number>();
    let worst = 0;
    let worstRoom = '';

    for (let i = 0; i < 40_000; i++) {
      step(world);
      for (const floor of world.floors) {
        if (floor.depth === VAULT_DEPTH) continue;
        for (const room of floor.rooms) {
          const empty = room.state === 'stocked' && monstersIn(world, floor.id, room.idx).length === 0;
          const run = empty ? (streaks.get(room.id) ?? 0) + 1 : 0;
          streaks.set(room.id, run);
          if (run > worst) {
            worst = run;
            worstRoom = `depth=${floor.depth} room=${room.idx} "${room.name}"`;
          }
        }
      }
    }

    expect(worst, `stocked-but-empty for ${worst} ticks: ${worstRoom}`).toBeLessThan(500);
  }, 120_000);
});
