import type { FrameDTO, MoveLeg, Op } from '@donjon/shared';
import type { SimStore } from './store.svelte.js';

export type ApplyResult = 'ok' | 'gap';

export interface MotionState {
  legs: Map<number, MoveLeg[]>;
}

export function createMotion(): MotionState {
  return { legs: new Map() };
}

export function applyFrame(sim: SimStore, motion: MotionState, frame: FrameDTO): ApplyResult {
  if (frame.from !== sim.seq && sim.seq !== 0) return 'gap';

  const teams = [...sim.teams];
  const tokens = [...sim.tokens];
  let teamsDirty = false;
  let tokensDirty = false;

  for (const op of frame.ops) {
    switch (op.o) {
      case 'team+':
        teams.push(op.t);
        teamsDirty = true;
        break;

      case 'team': {
        const idx = teams.findIndex((t) => t.id === op.id);
        if (idx >= 0) {
          teams[idx] = { ...teams[idx], ...op.p } as (typeof teams)[number];
          teamsDirty = true;
        }
        break;
      }

      case 'team-': {
        const idx = teams.findIndex((t) => t.id === op.id);
        if (idx >= 0) {
          teams.splice(idx, 1);
          teamsDirty = true;
        }
        break;
      }

      case 'tok+':
        tokens.push(op.t);
        tokensDirty = true;
        break;

      case 'tok-': {
        const idx = tokens.findIndex((t) => t.id === op.id);
        if (idx >= 0) {
          tokens.splice(idx, 1);
          tokensDirty = true;
        }
        motion.legs.delete(op.id);
        break;
      }

      case 'mv': {
        const idx = tokens.findIndex((t) => t.id === op.id);
        const last = op.legs[op.legs.length - 1];
        if (idx >= 0 && last) {
          tokens[idx] = { ...tokens[idx], x: last[2], y: last[3], floorId: op.f } as (typeof tokens)[number];
          tokensDirty = true;
        }
        motion.legs.set(op.id, op.legs);
        break;
      }

      case 'warp': {
        const idx = tokens.findIndex((t) => t.id === op.id);
        if (idx >= 0) {
          tokens[idx] = { ...tokens[idx], x: op.x, y: op.y, floorId: op.f } as (typeof tokens)[number];
          tokensDirty = true;
        }
        motion.legs.delete(op.id);
        break;
      }

      case 'ev':
        if (op.e.id > sim.maxEventId) {
          sim.maxEventId = op.e.id;
          const merged = [...sim.ticker, op.e];
          sim.ticker = merged.slice(Math.max(0, merged.length - 200));
        }
        break;

      case 'keeper':
        if (sim.keeper) sim.keeper = { ...sim.keeper, ...op.p };
        break;

      case 'lb':
        sim.leaderboard = op.rows;
        break;

      case 'mem':
        sim.memorial = op.rows;
        break;

      case 'mon':
        sim.monsters = op.rows;
        break;

      case 'floor':
        sim.floors = op.rows;
        break;

      case 'cnt':
        sim.casualties = op.casualties;
        sim.heroesLiving = op.heroesLiving;
        sim.tavernSize = op.tavernSize;
        break;

      default:
        return 'gap';
    }
  }

  if (teamsDirty) sim.teams = teams;
  if (tokensDirty) sim.tokens = tokens;

  sim.tick = frame.tick;
  sim.seq = frame.seq;
  sim.dt = frame.dt;
  if (frame.dt > 0) sim.speed = Math.round((1000 / frame.dt) * 100) / 100;
  sim.frameTs = frame.ts;
  sim.lastFrameAt = Date.now();

  return 'ok';
}

export function interpolate(
  motion: MotionState,
  tokenId: number,
  playbackTick: number,
  fallbackX: number,
  fallbackY: number,
): { x: number; y: number } {
  const legs = motion.legs.get(tokenId);
  if (!legs || legs.length === 0) return { x: fallbackX, y: fallbackY };

  for (const leg of legs) {
    const [x0, y0, x1, y1, t0, t1] = leg;
    if (playbackTick >= t0 && playbackTick < t1) {
      const span = t1 - t0 || 1;
      const raw = (playbackTick - t0) / span;
      const eased = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
      return { x: x0 + (x1 - x0) * eased, y: y0 + (y1 - y0) * eased };
    }
  }

  const last = legs[legs.length - 1];
  if (last && playbackTick >= last[5]) return { x: last[2], y: last[3] };
  const first = legs[0];
  if (first && playbackTick < first[4]) return { x: first[0], y: first[1] };
  return { x: fallbackX, y: fallbackY };
}
