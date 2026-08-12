import { describe, expect, it } from 'vitest';
import { buildFrame } from '../src/snapshot/delta.js';
import { projectSnapshot } from '../src/snapshot/projector.js';
import { newWorld } from '../src/engine/setup.js';
import { step } from '../src/engine/step.js';

const SEED = 0xd0f0a;

describe('movement legs are timed in ticks', () => {
  it('stamps every leg inside the frame tick window', () => {
    const world = newWorld(SEED);
    for (let i = 0; i < 400; i++) step(world);

    let seq = 40;
    let prev = projectSnapshot(world, seq, 1);
    let prevTick = world.tick;
    let checked = 0;

    for (let frame = 0; frame < 300; frame++) {
      for (const team of world.teams) team.trail.length = 0;
      step(world);
      seq += 1;
      const next = projectSnapshot(world, seq, 1);
      const built = buildFrame(prev, next, { seq, from: seq - 1, fromTick: prevTick, speed: 1 });

      for (const op of built.ops) {
        if (op.o !== 'mv') continue;
        for (const [, , , , t0, t1] of op.legs) {
          expect(t0).toBeGreaterThanOrEqual(prevTick);
          expect(t1).toBeLessThanOrEqual(next.tick);
          expect(t1).toBeGreaterThan(t0);
          checked += 1;
        }
      }

      prev = next;
      prevTick = next.tick;
    }

    expect(checked).toBeGreaterThan(0);
  });

  it('a playback clock inside the window lands between the leg endpoints', () => {
    const world = newWorld(SEED);
    for (let i = 0; i < 400; i++) step(world);

    let seq = 7;
    let prev = projectSnapshot(world, seq, 1);
    let prevTick = world.tick;

    for (let frame = 0; frame < 300; frame++) {
      for (const team of world.teams) team.trail.length = 0;
      for (let i = 0; i < 4; i++) step(world);
      seq += 1;
      const next = projectSnapshot(world, seq, 1);
      const built = buildFrame(prev, next, { seq, from: seq - 1, fromTick: prevTick, speed: 1 });

      for (const op of built.ops) {
        if (op.o !== 'mv' || op.legs.length < 2) continue;
        const mid = (prevTick + next.tick) / 2;
        const covering = op.legs.find(([, , , , t0, t1]) => mid >= t0 && mid < t1);
        expect(covering).toBeDefined();
      }

      prev = next;
      prevTick = next.tick;
    }
  });
});
