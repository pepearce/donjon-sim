import { describe, expect, it } from 'vitest';
import type { SnapshotDTO } from '@donjon/shared';
import { buildFrame, opsAreOrdered, OP_PHASE_ORDER } from '../src/snapshot/delta.js';
import { projectSnapshot } from '../src/snapshot/projector.js';
import { newWorld } from '../src/engine/setup.js';
import { step } from '../src/engine/step.js';

function applyToPlain(snapshot: SnapshotDTO, frame: ReturnType<typeof buildFrame>): SnapshotDTO {
  const next: SnapshotDTO = JSON.parse(JSON.stringify(snapshot)) as SnapshotDTO;
  let maxEventId = next.events.reduce((n, e) => Math.max(n, e.id), 0);

  for (const op of frame.ops) {
    switch (op.o) {
      case 'team+':
        next.teams.push(op.t);
        break;
      case 'team': {
        const i = next.teams.findIndex((t) => t.id === op.id);
        if (i >= 0) next.teams[i] = { ...next.teams[i], ...op.p } as (typeof next.teams)[number];
        break;
      }
      case 'team-':
        next.teams = next.teams.filter((t) => t.id !== op.id);
        break;
      case 'tok+':
        next.tokens.push(op.t);
        break;
      case 'tok-':
        next.tokens = next.tokens.filter((t) => t.id !== op.id);
        break;
      case 'mv': {
        const i = next.tokens.findIndex((t) => t.id === op.id);
        const last = op.legs[op.legs.length - 1];
        if (i >= 0 && last) {
          next.tokens[i] = { ...next.tokens[i], x: last[2], y: last[3], floorId: op.f } as (typeof next.tokens)[number];
        }
        break;
      }
      case 'warp': {
        const i = next.tokens.findIndex((t) => t.id === op.id);
        if (i >= 0) {
          next.tokens[i] = { ...next.tokens[i], x: op.x, y: op.y, floorId: op.f } as (typeof next.tokens)[number];
        }
        break;
      }
      case 'ev':
        if (op.e.id > maxEventId) {
          maxEventId = op.e.id;
          next.events.push(op.e);
        }
        break;
      case 'keeper':
        next.keeper = { ...next.keeper, ...op.p };
        break;
      case 'lb':
        next.leaderboard = op.rows;
        break;
      case 'mem':
        next.memorial = op.rows;
        break;
      case 'floor':
        next.floors = op.rows;
        break;
      case 'cnt':
        next.casualties = op.casualties;
        next.heroesLiving = op.heroesLiving;
        next.tavernSize = op.tavernSize;
        break;
      default:
        break;
    }
  }

  next.tick = frame.tick;
  next.seq = frame.seq;
  next.events = next.events.slice(-60);
  return next;
}

describe('delta protocol', () => {
  it('reconstructs the authoritative snapshot from deltas alone over 600 frames', () => {
    const world = newWorld(0xd0f0a);
    let seq = 0;
    let previous = projectSnapshot(world, seq, 1);
    let mirror: SnapshotDTO = JSON.parse(JSON.stringify(previous)) as SnapshotDTO;

    for (let i = 0; i < 600; i++) {
      for (let t = 0; t < 2; t++) step(world);
      const from = seq;
      seq += 1;
      const next = projectSnapshot(world, seq, 1);
      const frame = buildFrame(previous, next, { seq, from, fromTick: previous.tick, speed: 1 });

      expect(opsAreOrdered([...frame.ops].sort((a, b) => OP_PHASE_ORDER[a.o] - OP_PHASE_ORDER[b.o]))).toBe(true);

      mirror = applyToPlain(mirror, frame);
      previous = next;

      const mirrorTokens = [...mirror.tokens].sort((a, b) => a.id - b.id);
      const realTokens = [...next.tokens].sort((a, b) => a.id - b.id);
      expect(mirrorTokens.map((t) => `${t.id}:${t.x},${t.y}@${t.floorId}`)).toEqual(
        realTokens.map((t) => `${t.id}:${t.x},${t.y}@${t.floorId}`),
      );

      const mirrorTeams = [...mirror.teams].sort((a, b) => a.id - b.id);
      const realTeams = [...next.teams].sort((a, b) => a.id - b.id);
      expect(mirrorTeams.map((t) => `${t.id}:${t.state}:${t.goldCp}`)).toEqual(
        realTeams.map((t) => `${t.id}:${t.state}:${t.goldCp}`),
      );

      expect(mirror.casualties).toBe(next.casualties);
      expect(mirror.keeper.treasuryCp).toBe(next.keeper.treasuryCp);
    }
  });

  it('is idempotent — replaying a frame changes nothing', () => {
    const world = newWorld(0xd0f0a);
    for (let i = 0; i < 400; i++) step(world);
    const a = projectSnapshot(world, 1, 1);
    for (let i = 0; i < 2; i++) step(world);
    const b = projectSnapshot(world, 2, 1);
    const frame = buildFrame(a, b, { seq: 2, from: 1, fromTick: a.tick, speed: 1 });

    const once = applyToPlain(JSON.parse(JSON.stringify(a)) as SnapshotDTO, frame);
    const twice = applyToPlain(once, frame);
    expect(JSON.stringify(twice.tokens)).toBe(JSON.stringify(once.tokens));
    expect(twice.casualties).toBe(once.casualties);
    expect(twice.events.length).toBe(once.events.length);
  });

  it('emits a warp rather than a move when a token changes floor', () => {
    const a = projectSnapshot(newWorld(0xd0f0a), 1, 1);
    const b: SnapshotDTO = JSON.parse(JSON.stringify(a)) as SnapshotDTO;
    const token = b.tokens[0];
    if (token) {
      token.floorId = 2;
      token.x += 1;
    }
    const frame = buildFrame(a, b, { seq: 2, from: 1, fromTick: a.tick, speed: 1 });
    expect(frame.ops.some((op) => op.o === 'warp')).toBe(true);
    expect(frame.ops.some((op) => op.o === 'mv')).toBe(false);
  });

  it('carries dt and tick in every frame, even an empty one', () => {
    const a = projectSnapshot(newWorld(0xd0f0a), 1, 4);
    const frame = buildFrame(a, a, { seq: 2, from: 1, fromTick: a.tick, speed: 4 });
    expect(frame.ops).toEqual([]);
    expect(frame.dt).toBe(250);
    expect(frame.tick).toBe(a.tick);
    expect(frame.from).toBe(1);
  });

  it('defines a phase order that puts spawns before moves before despawns', () => {
    expect(OP_PHASE_ORDER['team+']).toBeLessThan(OP_PHASE_ORDER['mv']);
    expect(OP_PHASE_ORDER['mv']).toBeLessThan(OP_PHASE_ORDER['ev']);
    expect(OP_PHASE_ORDER['ev']).toBeLessThan(OP_PHASE_ORDER['tok-']);
    expect(opsAreOrdered([{ o: 'tok-', id: 1 }, { o: 'team+', t: {} as never }])).toBe(false);
  });
});
