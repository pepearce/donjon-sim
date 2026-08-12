import { PROTOCOL_VERSION, TICK_MS, type FrameDTO, type MoveLeg, type Op, type SnapshotDTO } from '@donjon/shared';

export interface FrameContext {
  seq: number;
  from: number;
  fromTick: number;
  speed: number;
}

function shallowPatch<T extends Record<string, unknown>>(prev: T, next: T): Partial<T> {
  const patch: Partial<T> = {};
  for (const key of Object.keys(next) as Array<keyof T>) {
    const a = prev[key];
    const b = next[key];
    if (typeof b === 'object' && b !== null) {
      if (JSON.stringify(a) !== JSON.stringify(b)) patch[key] = b;
    } else if (a !== b) {
      patch[key] = b;
    }
  }
  return patch;
}

export function buildFrame(prev: SnapshotDTO, next: SnapshotDTO, ctx: FrameContext): FrameDTO {
  const ops: Op[] = [];

  const prevTeams = new Map(prev.teams.map((t) => [t.id, t]));
  const nextTeams = new Map(next.teams.map((t) => [t.id, t]));
  const prevTokens = new Map(prev.tokens.map((t) => [t.id, t]));
  const nextTokens = new Map(next.tokens.map((t) => [t.id, t]));

  for (const [id, team] of nextTeams) {
    if (!prevTeams.has(id)) ops.push({ o: 'team+', t: team });
  }
  for (const [id, token] of nextTokens) {
    if (!prevTokens.has(id)) ops.push({ o: 'tok+', t: token });
  }

  for (const [id, team] of nextTeams) {
    const before = prevTeams.get(id);
    if (!before) continue;
    const patch = shallowPatch(
      before as unknown as Record<string, unknown>,
      team as unknown as Record<string, unknown>,
    );
    if (Object.keys(patch).length > 0) ops.push({ o: 'team', id, p: patch as never });
  }

  if (JSON.stringify(prev.keeper) !== JSON.stringify(next.keeper)) {
    const patch = shallowPatch(
      prev.keeper as unknown as Record<string, unknown>,
      next.keeper as unknown as Record<string, unknown>,
    );
    if (Object.keys(patch).length > 0) ops.push({ o: 'keeper', p: patch as never });
  }

  if (JSON.stringify(prev.floors) !== JSON.stringify(next.floors)) {
    ops.push({ o: 'floor', rows: next.floors });
  }

  const dt = TICK_MS / ctx.speed;
  for (const [id, token] of nextTokens) {
    const before = prevTokens.get(id);
    if (!before) continue;

    if (before.floorId !== token.floorId) {
      ops.push({ o: 'warp', id, f: token.floorId, x: token.x, y: token.y });
      continue;
    }
    if (before.x === token.x && before.y === token.y) continue;

    const steps = token.trail ?? [];
    const walked: Array<[number, number]> = [[before.x, before.y]];
    for (const step of steps) {
      const last = walked[walked.length - 1];
      if (!last || (last[0] === step[0] && last[1] === step[1])) continue;
      walked.push([step[0], step[1]]);
    }
    const tail = walked[walked.length - 1];
    if (!tail || tail[0] !== token.x || tail[1] !== token.y) walked.push([token.x, token.y]);

    const contiguous = walked.every((point, i) => {
      if (i === 0) return true;
      const prevPoint = walked[i - 1];
      if (!prevPoint) return false;
      return Math.abs(point[0] - prevPoint[0]) + Math.abs(point[1] - prevPoint[1]) === 1;
    });

    if (!contiguous || walked.length > 40) {
      ops.push({ o: 'warp', id, f: token.floorId, x: token.x, y: token.y });
      continue;
    }

    const span = Math.max(1, next.tick - ctx.fromTick);
    const legCount = walked.length - 1;
    const legs: MoveLeg[] = [];
    for (let i = 0; i < legCount; i++) {
      const a = walked[i];
      const b = walked[i + 1];
      if (!a || !b) continue;
      legs.push([
        a[0],
        a[1],
        b[0],
        b[1],
        ctx.fromTick + (span * i) / legCount,
        ctx.fromTick + (span * (i + 1)) / legCount,
      ]);
    }
    if (legs.length === 0) continue;
    ops.push({ o: 'mv', id, f: token.floorId, legs });
  }

  const seen = new Set(prev.events.map((e) => e.id));
  for (const event of next.events) {
    if (!seen.has(event.id)) ops.push({ o: 'ev', e: event });
  }

  if (
    prev.casualties !== next.casualties ||
    prev.heroesLiving !== next.heroesLiving ||
    prev.tavernSize !== next.tavernSize
  ) {
    ops.push({
      o: 'cnt',
      casualties: next.casualties,
      heroesLiving: next.heroesLiving,
      tavernSize: next.tavernSize,
    });
  }

  if (JSON.stringify(prev.leaderboard) !== JSON.stringify(next.leaderboard)) {
    ops.push({ o: 'lb', rows: next.leaderboard });
  }
  if (JSON.stringify(prev.memorial) !== JSON.stringify(next.memorial)) {
    ops.push({ o: 'mem', rows: next.memorial });
  }
  if (JSON.stringify(prev.monsters) !== JSON.stringify(next.monsters)) {
    ops.push({ o: 'mon', rows: next.monsters });
  }

  for (const [id] of prevTokens) {
    if (!nextTokens.has(id)) ops.push({ o: 'tok-', id });
  }
  for (const [id] of prevTeams) {
    if (!nextTeams.has(id)) ops.push({ o: 'team-', id });
  }

  return {
    v: PROTOCOL_VERSION,
    seq: ctx.seq,
    tick: next.tick,
    from: ctx.from,
    ts: Date.now(),
    dt,
    ops,
  };
}

export const OP_PHASE_ORDER: Record<Op['o'], number> = {
  'team+': 0,
  'tok+': 0,
  team: 1,
  keeper: 1,
  floor: 1,
  mv: 2,
  warp: 2,
  ev: 3,
  cnt: 4,
  lb: 4,
  mem: 4,
  mon: 4,
  'tok-': 5,
  'team-': 5,
};

export function opsAreOrdered(ops: readonly Op[]): boolean {
  let phase = -1;
  for (const op of ops) {
    const p = OP_PHASE_ORDER[op.o];
    if (p < phase) return false;
    phase = Math.max(phase, p);
  }
  return true;
}
