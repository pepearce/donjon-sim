import type { ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import type { FrameDTO } from '@donjon/shared';
import { Hub } from '../src/net/hub.js';
import { newWorld } from '../src/engine/setup.js';
import { step } from '../src/engine/step.js';

const SEED = 0xd0f0a;

interface FakeClient {
  res: ServerResponse;
  frames: FrameDTO[];
}

function fakeClient(): FakeClient {
  const frames: FrameDTO[] = [];
  const res = {
    writableLength: 0,
    writeHead: () => res,
    on: () => res,
    end: () => res,
    write: (chunk: string | Buffer) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (const block of text.split('\n\n')) {
        if (!block.startsWith('event: frame')) continue;
        const line = block.split('\n').find((l) => l.startsWith('data: '));
        if (line) frames.push(JSON.parse(line.slice(6)) as FrameDTO);
      }
      return true;
    },
  } as unknown as ServerResponse;
  return { res: res, frames };
}

describe('hub keeps a broadcast-aligned delta baseline', () => {
  it('still interpolates movement when another client connects mid-window', () => {
    const world = newWorld(SEED);
    for (let i = 0; i < 400; i++) step(world);

    const hub = new Hub(30);
    const watcher = fakeClient();
    hub.add(watcher.res, world, null);

    // one full window so the baseline and the trails line up
    for (let i = 0; i < 15; i++) step(world);
    hub.broadcast(world);

    const floorAtWindowStart = new Map(world.teams.map((t) => [t.id, t.floorId]));

    // a second viewer arrives part-way through the next window
    for (let i = 0; i < 7; i++) step(world);
    hub.add(fakeClient().res, world, null);
    for (let i = 0; i < 8; i++) step(world);

    watcher.frames.length = 0;
    hub.broadcast(world);

    const frame = watcher.frames.at(-1);
    expect(frame).toBeDefined();
    const moves = frame?.ops.filter((o) => o.o === 'mv') ?? [];
    const warps = frame?.ops.filter((o) => o.o === 'warp') ?? [];

    expect(moves.length).toBeGreaterThan(0);

    const spurious = warps.filter((w) => floorAtWindowStart.get(w.id) === w.f);
    expect(spurious).toEqual([]);
  });
});
