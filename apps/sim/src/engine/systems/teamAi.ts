import { RngDomain, rngFor } from '@donjon/shared';
import { floorOf, livingRoster, monstersIn, roster } from '../world.js';
import { clamp, type Floor, type Team, type World } from '../types.js';

export type Action = 'EXPLORE' | 'DESCEND' | 'LOOT' | 'REST' | 'RETREAT' | 'FLEE';

export const COMMIT_TICKS: Record<Action, number> = {
  EXPLORE: 6,
  DESCEND: 6,
  LOOT: 2,
  REST: 20,
  RETREAT: 30,
  FLEE: 0,
};

const COMMIT_BONUS = 12e6;
const EMERGENCY_BONUS = 60e6;

export interface AiContext {
  hpFrac: number;
  worstHpFrac: number;
  morale: number;
  greed: number;
  rationsFrac: number;
  depth: number;
  distToExit: number;
  downed: number;
  threatRatio: number;
  lvlGap: number;
  unclearedFrac: number;
  ticksSinceNewDeepest: number;
  inCombat: boolean;
  roomLootCp: number;
  roomSafe: boolean;
  hasDeeperFloor: boolean;
  carriedCp: number;
  canAffordRest: boolean;
}

export function buildContext(world: World, team: Team, floor: Floor): AiContext {
  const crew = roster(world, team);
  const living = crew.filter((h) => h.state === 'ok');
  const hp = living.reduce((n, h) => n + h.hp, 0);
  const hpMax = living.reduce((n, h) => n + h.hpMax, 0) || 1;
  const worst = living.reduce((min, h) => Math.min(min, h.hp / h.hpMax), 1);
  const enemies = monstersIn(world, team.floorId, team.roomIdx);
  const meanLevel = living.length > 0 ? living.reduce((n, h) => n + h.level, 0) / living.length : 1;
  const uncleared = floor.rooms.filter((r) => r.state === 'stocked').length;
  const enemyPower = enemies.reduce((n, m) => n + m.cr, 0);
  const teamPower = living.reduce((n, h) => n + h.level * 0.9, 0) || 0.5;

  return {
    hpFrac: living.length > 0 ? hp / hpMax : 0,
    worstHpFrac: living.length > 0 ? worst : 0,
    morale: team.morale,
    greed: team.greed,
    rationsFrac: clamp(0, 1, team.rations / 40),
    depth: floor.depth,
    distToExit: floor.dist[team.roomIdx * floor.rooms.length + floor.entryRoom] ?? 10,
    downed: crew.filter((h) => h.state === 'downed').length,
    threatRatio: enemyPower / teamPower,
    lvlGap: meanLevel - (1 + 1.3 * (floor.depth - 1)),
    unclearedFrac: floor.rooms.length > 0 ? uncleared / floor.rooms.length : 0,
    ticksSinceNewDeepest: world.tick - team.commitUntilTick,
    inCombat: enemies.length > 0,
    roomLootCp: floor.rooms[team.roomIdx]?.lootCp ?? 0,
    roomSafe: enemies.length === 0,
    hasDeeperFloor: floor.depth < 10,
    carriedCp: team.carriedCp,
    canAffordRest: team.goldCp >= 400,
  };
}

export function score(ctx: AiContext, ticksSinceDeepest: number): Record<Action, number> {
  const downed = ctx.downed > 0 ? 1 : 0;

  const explore =
    35 +
    40 * ctx.hpFrac +
    0.3 * ctx.morale -
    25 * (1 - ctx.rationsFrac) +
    10 * ctx.greed -
    30 * downed -
    45 * (1 - ctx.unclearedFrac);

  const descend = ctx.hasDeeperFloor
    ? 20 +
      45 * ctx.hpFrac * (ctx.morale / 100) +
      32 * ctx.lvlGap +
      15 * ctx.greed -
      30 * (1 - ctx.rationsFrac) -
      40 * downed +
      25 * Math.min(1, ticksSinceDeepest / 7200)
    : -1e6;

  const loot = 15 + 55 * ctx.greed + 20 * Math.log10(1 + ctx.roomLootCp / 100) - 100 * (ctx.inCombat ? 1 : 0);

  const rest =
    5 +
    90 * (1 - ctx.hpFrac) ** 1.5 +
    0.5 * (60 - ctx.morale) +
    30 * (ctx.roomSafe ? 1 : 0) -
    60 * (ctx.rationsFrac <= 0 ? 1 : 0) -
    80 * (ctx.inCombat ? 1 : 0) -
    120 * (ctx.canAffordRest ? 0 : 1);

  const retreat =
    10 +
    70 * (1 - ctx.hpFrac) +
    0.6 * (50 - ctx.morale) +
    0.6 * Math.sqrt(ctx.carriedCp) +
    35 * (ctx.rationsFrac <= 0.15 ? 1 : 0) +
    25 * downed -
    0.8 * ctx.distToExit;

  const flee = ctx.inCombat
    ? 55 + 160 * (1 - ctx.hpFrac) + 1.2 * (45 - ctx.morale) + 80 * Math.max(0, ctx.threatRatio - 1)
    : -1e6;

  return { EXPLORE: explore, DESCEND: descend, LOOT: loot, REST: rest, RETREAT: retreat, FLEE: flee };
}

const ORDER: Action[] = ['EXPLORE', 'DESCEND', 'LOOT', 'REST', 'RETREAT', 'FLEE'];

export function chooseAction(world: World, team: Team): Action {
  const floor = floorOf(world, team.floorId);
  if (!floor) return 'EXPLORE';

  const ctx = buildContext(world, team, floor);
  const ticksSinceDeepest = world.tick - team.lastDeepestTick;
  const raw = score(ctx, ticksSinceDeepest);

  const quantised = new Map<Action, number>();
  for (const action of ORDER) {
    let value = Math.round((raw[action] ?? -1e6) * 1e6);
    if (action === team.lastAction && world.tick < team.commitUntilTick) value += COMMIT_BONUS;
    if ((action === 'RETREAT' || action === 'FLEE') && (ctx.worstHpFrac < 0.15 || ctx.downed > 0)) {
      value += EMERGENCY_BONUS;
    }
    quantised.set(action, value);
  }

  let bestOrdinal = 0;
  let bestValue = -Infinity;
  for (let ordinal = 0; ordinal < ORDER.length; ordinal++) {
    const action = ORDER[ordinal];
    if (!action) continue;
    const value = quantised.get(action) ?? -Infinity;
    if (value > bestValue) {
      bestOrdinal = ordinal;
      bestValue = value;
    }
  }
  const best: Action = ORDER[bestOrdinal] ?? 'EXPLORE';

  if (best === 'REST' && livingRoster(world, team).length === 0) return 'RETREAT';
  return best;
}

export function jitterFor(world: World, team: Team): number {
  return rngFor(world.seed, world.tick, RngDomain.TEAM_AI, team.id).float();
}
