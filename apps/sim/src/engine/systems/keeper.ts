import { DAY_TICKS, RngDomain, defineTunables, rngFor, type Rng } from '@donjon/shared';
import { emit } from '../emit.js';
import { GUARDIAN_NAMES, KEEPER_ACTIONS, MONSTERS, type KeeperActionDef } from '../tables.js';
import { floorOf } from '../world.js';
import { monsterFromCr, wageForCr } from './combat.js';
import { maybeStartScheme, schemeTarget } from './dungeon.js';
import { rungOf } from './standing.js';
import type { Floor, World } from '../types.js';

export const KEEPER = defineTunables('keeper', {
  hireDays: { default: 30, min: 1, max: 365, label: 'Hire contract (days)' },
  hireCrBoost: { default: 1.4, min: 1, max: 10, step: 0.01, label: 'Hire CR boost' },
  austerityTreasuryCp: { default: 10_000, min: 0, max: 10_000_000, label: 'Austerity trigger (cp)' },
  censuredHireMult: { default: 1.5, min: 1, max: 10, step: 0.01, label: 'Censured hire cost multiplier' },
});

const TRAIT_ACTION_BOOST: Record<string, string[]> = {
  miserly: ['toll_up', 'corpse_tax_up', 'austerity'],
  vain: ['marketing', 'hire_guardian'],
  vengeful: ['open_scheme'],
};

const OVERSEER_MENU = new Set(['toll_up', 'toll_cut', 'observe']);

export function traitWeightMult(trait: string, actionId: string): number {
  return (TRAIT_ACTION_BOOST[trait] ?? []).includes(actionId) ? 2 : 1;
}

function actionWeight(world: World, action: KeeperActionDef): number {
  const d = world.dungeon;
  return (action.weights[d.keeperMood] ?? 0) * traitWeightMult(d.keeperTrait, action.id);
}

function hireFloor(world: World): Floor | undefined {
  const marked = schemeTarget(world);
  if (marked && marked.state !== 'disbanded') {
    const floor = floorOf(world, marked.floorId);
    if (floor) return floor;
  }

  const leader = world.teams
    .filter((t) => t.state !== 'disbanded')
    .sort((a, b) => b.renownMilli - a.renownMilli || a.id - b.id)[0];
  const led = leader ? floorOf(world, leader.floorId) : undefined;
  if (led) return led;

  return [...world.floors].sort((a, b) => b.depth - a.depth)[0];
}

function hireCr(floor: Floor): number {
  return Math.max(1, floor.dangerCr * KEEPER.hireCrBoost);
}

export function keeperCost(world: World, action: KeeperActionDef): number {
  if (action.id !== 'hire_guardian') return action.costCp;
  const floor = hireFloor(world);
  if (!floor) return Number.MAX_SAFE_INTEGER;
  const base = KEEPER.hireDays * wageForCr(hireCr(floor));
  return rungOf(world.dungeon.standing) === 'censured' ? Math.round(base * KEEPER.censuredHireMult) : base;
}

function available(world: World, action: KeeperActionDef): boolean {
  const d = world.dungeon;

  if (action.tollBp !== undefined && d.tollBp === action.tollBp) return false;
  if (action.entryFeeCp !== undefined && d.entryFeeCp === action.entryFeeCp) return false;
  if (action.corpseTaxBp !== undefined && d.corpseTaxBp === action.corpseTaxBp) return false;

  if (action.id === 'austerity') return !d.austerity && d.treasuryCp < KEEPER.austerityTreasuryCp;
  if (action.id === 'open_scheme') {
    return d.scheme === null && world.teams.some((t) => t.state !== 'disbanded');
  }
  if (action.id === 'hire_guardian') return hireFloor(world) !== undefined;
  return true;
}

export function keeperEligible(world: World): KeeperActionDef[] {
  const d = world.dungeon;
  const rung = rungOf(d.standing);
  return KEEPER_ACTIONS.filter((action) => {
    if (rung === 'overseer' && !OVERSEER_MENU.has(action.id)) return false;
    if (rung === 'censured' && action.id === 'open_scheme') return false;
    if (actionWeight(world, action) <= 0) return false;

    const last = d.keeperAct.cooldowns[action.id];
    if (last !== undefined && world.tick - last < action.cooldownDays * DAY_TICKS) return false;

    if (keeperCost(world, action) + action.reserveCp > d.treasuryCp) return false;
    return available(world, action);
  });
}

function weightedPick(world: World, rng: Rng, actions: KeeperActionDef[]): KeeperActionDef {
  let total = 0;
  for (const action of actions) total += actionWeight(world, action);
  if (total <= 0) return actions[actions.length - 1] as KeeperActionDef;

  let roll = rng.int(1, total);
  for (const action of actions) {
    roll -= actionWeight(world, action);
    if (roll <= 0) return action;
  }
  return actions[actions.length - 1] as KeeperActionDef;
}

function decree(world: World, action: KeeperActionDef): string {
  emit(world, { type: 'KEEPER_DECREE', payload: { decree: action.id, text: action.text } });
  return action.text;
}

function applyRates(world: World, action: KeeperActionDef): string {
  const d = world.dungeon;
  if (action.tollBp !== undefined) d.tollBp = action.tollBp;
  if (action.entryFeeCp !== undefined) d.entryFeeCp = action.entryFeeCp;
  if (action.corpseTaxBp !== undefined) d.corpseTaxBp = action.corpseTaxBp;
  return decree(world, action);
}

function hireGuardian(world: World, rng: Rng): string {
  const floor = hireFloor(world);
  if (!floor) return '';

  const cr = hireCr(floor);
  const pool = MONSTERS.filter((m) => m.minDepth <= floor.depth);
  const guardians = pool.filter((m) => m.guardian);
  const archetype = guardians.length > 0 ? rng.pick(guardians) : rng.pick(pool);
  const room = floor.rooms[floor.stairsRoom];
  if (!archetype || !room) return '';

  const monster = monsterFromCr(world, archetype.name, cr, room.id, floor.id, true);
  world.monsters.push(monster);

  const titled = rng.pick(GUARDIAN_NAMES);
  emit(world, {
    type: 'GUARDIAN_HIRED',
    floorId: floor.id,
    roomId: room.id,
    payload: {
      monster: titled.name,
      title: titled.title,
      archetype: monster.name,
      depth: floor.depth,
      floor: floor.name,
      cr: Math.round(cr * 10) / 10,
      cp: monster.wageCpPerDay,
      wageCp: monster.wageCpPerDay,
      hiredBy: 'keeper',
    },
  });

  return `engaged ${titled.name} to hold floor ${floor.depth}`;
}

function openScheme(world: World): string {
  maybeStartScheme(world);
  const scheme = world.dungeon.scheme;
  if (!scheme) return '';
  const target = schemeTarget(world);
  return `opened “${scheme.name}” against ${target?.name ?? 'the leaders'}`;
}

function declareAusterity(world: World, action: KeeperActionDef): string {
  world.dungeon.austerity = true;
  return decree(world, action);
}

export function keeperAct(world: World): string {
  const d = world.dungeon;
  const eligible = keeperEligible(world);
  const observe = KEEPER_ACTIONS.find((a) => a.id === 'observe') as KeeperActionDef;
  const menu = eligible.length > 0 ? eligible : [observe];

  const rng = rngFor(world.seed, world.tick, RngDomain.KEEPER, 0);
  const action = weightedPick(world, rng, menu);

  const cost = action.id === 'observe' ? 0 : keeperCost(world, action);
  d.treasuryCp -= cost;
  d.sinkCp += cost;

  let text = action.text;
  if (action.id === 'hire_guardian') text = hireGuardian(world, rng);
  else if (action.id === 'open_scheme') text = openScheme(world);
  else if (action.id === 'austerity') text = declareAusterity(world, action);
  else if (action.id !== 'observe') text = applyRates(world, action);

  d.keeperAct = {
    last: action.id,
    tick: world.tick,
    text: text === '' ? observe.text : text,
    cooldowns: { ...d.keeperAct.cooldowns, [action.id]: world.tick },
  };

  return action.id;
}
