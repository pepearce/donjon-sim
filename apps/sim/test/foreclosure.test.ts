import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '@donjon/shared';
import { FORECLOSE_DAYS, dailyUpkeep } from '../src/engine/systems/economy.js';
import { newWorld } from '../src/engine/setup.js';
import { step } from '../src/engine/step.js';

const SEED = 0xd0f0a;

describe('unpaid staff quit', () => {
  it('sheds staff during austerity and returns their rooms to the restock ledger', () => {
    const world = newWorld(SEED);
    world.dungeon.austerity = true;
    world.tick = DAY_TICKS;

    const before = world.monsters.filter((m) => m.alive).length;
    dailyUpkeep(world);
    const after = world.monsters.filter((m) => m.alive).length;

    expect(after).toBeLessThan(before);
    expect(world.pendingEvents.some((e) => e.type === 'STAFF_QUIT')).toBe(true);

    for (const floor of world.floors) {
      for (const room of floor.rooms) {
        if (room.state !== 'stocked') continue;
        const occupied = world.monsters.some(
          (m) => m.alive && m.floorId === floor.id && m.roomId === room.id,
        );
        expect(occupied, `stocked room ${room.id} left empty`).toBe(true);
      }
    }
  });

  it('keeps the full payroll employed when the Keeper pays', () => {
    const world = newWorld(SEED);
    world.tick = DAY_TICKS;
    const before = world.monsters.filter((m) => m.alive).length;
    dailyUpkeep(world);
    expect(world.monsters.filter((m) => m.alive).length).toBe(before);
  });
});

describe('foreclosure', () => {
  it('forecloses after enough consecutive insolvent days', () => {
    const world = newWorld(SEED);
    world.dungeon.treasuryCp = 0;
    world.dungeon.loanCp = 25_000;
    world.dungeon.austerity = true;
    world.dungeon.standing = 0;

    for (let day = 1; day <= FORECLOSE_DAYS; day++) {
      world.tick = day * DAY_TICKS;
      world.dungeon.treasuryCp = 0;
      dailyUpkeep(world);
    }

    expect(world.foreclosed).toBe(true);
    expect(world.pendingEvents.some((e) => e.type === 'KHAN_FORECLOSURE')).toBe(true);
  });

  it('resets the clock when the treasury recovers', () => {
    const world = newWorld(SEED);
    world.dungeon.loanCp = 25_000;

    world.tick = DAY_TICKS;
    world.dungeon.treasuryCp = 0;
    dailyUpkeep(world);
    expect(world.dungeon.insolventDays).toBe(1);

    world.tick = 2 * DAY_TICKS;
    world.dungeon.treasuryCp = 50_000;
    dailyUpkeep(world);
    expect(world.dungeon.insolventDays).toBe(0);
    expect(world.foreclosed).toBe(false);
  });

  it('does not foreclose over a healthy 30k-tick run', () => {
    const world = newWorld(SEED);
    for (let i = 0; i < 30_000; i++) step(world);
    expect(world.foreclosed).toBe(false);
  }, 60_000);
});
