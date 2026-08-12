import { DAY_TICKS, RngDomain, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { keeperLine } from '../keeperLines.js';
import { SCHEME_NAMES } from '../tables.js';
import { adjustKhanStanding, rungOf } from './standing.js';
import { clamp, type KeeperScheme, type Team, type World } from '../types.js';

const REVENUE_TARGET_CP = 9000;
const LOAN_CP = 25_000;
const SCHEME_KINDS = ['bankrupt', 'blood_quota', 'stop_descent', 'toll_harvest'];
const SCHEME_DAYS = 3;
const SCHEME_FLOOR_BOOST = 1.15;
const SCHEME_STANDING_FLOOR = -60;

export function updateFameAndNotoriety(world: World): void {
  const d = world.dungeon;
  d.fameMilli = Math.round(d.fameMilli * 0.999);
  d.notorietyMilli = Math.round(d.notorietyMilli * 0.9988);
}

export function updateAggression(world: World, delvesWithDeath: number, delvesCompleted: number): void {
  const d = world.dungeon;
  if (delvesCompleted > 0) {
    const observed = delvesWithDeath / delvesCompleted;
    d.lethalityEmaMilli = Math.round(0.995 * d.lethalityEmaMilli + 0.005 * observed * 1000);
  }
  d.revenueEmaCp = Math.round(0.99 * d.revenueEmaCp + 0.01 * d.corpseYieldCp);

  const lethality = d.lethalityEmaMilli / 1000;
  const delta =
    0.015 * ((REVENUE_TARGET_CP - d.revenueEmaCp) / REVENUE_TARGET_CP) - 0.02 * (lethality - 0.22);

  d.aggressionMilli = Math.round(clamp(550, 1750, d.aggressionMilli + delta * 1000));
  d.corpseYieldCp = 0;
}

export function updateKeeperMood(world: World): void {
  const d = world.dungeon;
  if (d.treasuryCp < 5_000) d.keeperMood = 'bankrupt';
  else if (d.treasuryCp < 30_000) d.keeperMood = 'panicked';
  else if (d.aggressionMilli > 1200) d.keeperMood = 'greedy';
  else d.keeperMood = 'content';
}

export function resolveLoan(world: World): void {
  const d = world.dungeon;

  if (d.treasuryCp < 5_000 && d.loanCp === 0) {
    d.loanCp = LOAN_CP;
    d.treasuryCp += LOAN_CP;
    d.mintedCp += LOAN_CP;
    d.loanTakenTick = world.tick;
    adjustKhanStanding(world, -5);
    emit(world, {
      type: 'KHAN_LOAN',
      payload: { cp: LOAN_CP, action: 'taken', text: keeperLine(world, 'loan_taken') },
    });
    return;
  }

  if (d.treasuryCp < 5_000 && d.loanCp > 0 && !d.austerity) {
    if (rungOf(d.standing) === 'favored' && world.tick < d.loanTakenTick + DAY_TICKS) return;
    d.austerity = true;
    emit(world, {
      type: 'KEEPER_DECREE',
      payload: { decree: 'austerity', text: 'all guardians to work unpaid this quarter' },
    });
    return;
  }

  if (d.treasuryCp > 20_000 && d.loanCp > 0) {
    const pay = Math.min(d.loanCp, Math.floor(d.treasuryCp * 0.25));
    d.treasuryCp -= pay;
    d.sinkCp += pay;
    d.loanCp -= pay;
    if (d.loanCp === 0) {
      d.austerity = false;
      adjustKhanStanding(world, 10);
      emit(world, {
        type: 'KHAN_LOAN',
        payload: { cp: pay, action: 'repaid', text: keeperLine(world, 'loan_repaid') },
      });
    }
  }
}

export function adjustStanding(team: Team, delta: number): void {
  team.standing = clamp(-100, 100, team.standing + delta);
}

export function schemeTarget(world: World): Team | undefined {
  const scheme = world.dungeon.scheme;
  if (!scheme) return undefined;
  return world.teams.find((t) => t.id === scheme.targetTeamId);
}

export function schemeAggressionFactor(world: World, floorId: number): number {
  const target = schemeTarget(world);
  if (!target || target.state === 'disbanded' || target.floorId !== floorId) return 1;
  return SCHEME_FLOOR_BOOST;
}

export function maybeStartScheme(world: World): void {
  const d = world.dungeon;
  if (d.scheme) return;

  const active = world.teams
    .filter((t) => t.state !== 'disbanded')
    .sort((a, b) => b.renownMilli - a.renownMilli || a.id - b.id);
  const grudge =
    d.keeperTrait === 'vengeful'
      ? active.find((t) => t.id === d.lastBigHaulTeamId)
      : undefined;
  const target = grudge ?? active[0];
  if (!target) return;

  const rng = rngFor(world.seed, world.tick, RngDomain.SCHEME, world.nextSchemeId);
  const kind = rng.pick(SCHEME_KINDS);
  const name = rng.pick(SCHEME_NAMES);

  let goal = 0;
  let progress = 0;
  if (kind === 'bankrupt') {
    goal = Math.floor((target.goldCp + target.carriedCp) * 0.4);
    progress = target.goldCp + target.carriedCp;
  } else if (kind === 'blood_quota') {
    goal = d.heroesSlain + rng.int(3, 7);
    progress = d.heroesSlain;
  } else if (kind === 'stop_descent') {
    goal = target.deepestFloor + 1;
    progress = target.deepestFloor;
  } else {
    goal = 2000 + 500 * rng.int(1, 8);
    progress = 0;
  }

  const scheme: KeeperScheme = {
    id: world.nextSchemeId++,
    kind,
    targetTeamId: target.id,
    name,
    goal,
    progress,
    startedTick: world.tick,
    deadlineTick: world.tick + SCHEME_DAYS * DAY_TICKS,
    outcome: '',
  };
  d.scheme = scheme;
  adjustStanding(target, -10);

  emit(world, {
    type: 'KEEPER_SCHEME_SET',
    teamId: target.id,
    payload: { name, kind, team: target.name, goal, days: SCHEME_DAYS },
  });
}

function endScheme(world: World, scheme: KeeperScheme, outcome: string): void {
  scheme.outcome = outcome;
  adjustKhanStanding(world, outcome === 'won' ? 3 : -5);
  const target = schemeTarget(world);
  emit(world, {
    type: 'KEEPER_SCHEME_ENDED',
    teamId: scheme.targetTeamId,
    payload: { name: scheme.name, kind: scheme.kind, team: target?.name ?? 'a vanished company', outcome },
  });
  world.dungeon.scheme = null;
}

export function tickScheme(world: World): void {
  const scheme = world.dungeon.scheme;
  if (!scheme) return;

  const target = schemeTarget(world);
  const gone = !target || target.state === 'disbanded';
  if (target && !gone && target.standing > SCHEME_STANDING_FLOOR) adjustStanding(target, -1);

  let met = false;
  if (scheme.kind === 'bankrupt') {
    scheme.progress = target ? target.goldCp + target.carriedCp : 0;
    met = scheme.progress <= scheme.goal;
  } else if (scheme.kind === 'blood_quota') {
    scheme.progress = world.dungeon.heroesSlain;
    met = scheme.progress >= scheme.goal;
  } else if (scheme.kind === 'stop_descent') {
    scheme.progress = target ? target.deepestFloor : scheme.progress;
    if (scheme.progress >= scheme.goal) {
      endScheme(world, scheme, 'failed');
      return;
    }
    met = gone;
  } else {
    met = scheme.progress >= scheme.goal;
  }

  if (met && world.tick >= scheme.startedTick + DAY_TICKS) {
    endScheme(world, scheme, 'won');
    return;
  }
  if (world.tick >= scheme.deadlineTick) {
    endScheme(world, scheme, scheme.kind === 'stop_descent' ? 'won' : 'failed');
  }
}

export function creditTollScheme(world: World, tollCp: number): void {
  const scheme = world.dungeon.scheme;
  if (!scheme || scheme.kind !== 'toll_harvest') return;
  scheme.progress += tollCp;
}

