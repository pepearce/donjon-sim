import { DAY_TICKS, RngDomain, defineTunables, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { keeperLine } from '../keeperLines.js';
import { SCHEME_NAMES } from '../tables.js';
import { adjustKhanStanding, rungOf } from './standing.js';
import { clamp, type KeeperScheme, type Team, type World } from '../types.js';

export const DUNGEON = defineTunables('dungeon', {
  revenueTargetCp: { default: 9000, min: 0, max: 10_000_000, label: 'Daily revenue target (cp)' },
  loanCp: { default: 25_000, min: 0, max: 10_000_000, label: 'Overseer loan size (cp)' },
  repayFloorCp: { default: 8000, min: 0, max: 10_000_000, label: 'Loan repayment floor (cp)' },
  austerityLiftCp: { default: 5_000, min: 0, max: 10_000_000, label: 'Austerity lift line (cp)' },
  schemeDays: { default: 3, min: 1, max: 100, label: 'Scheme duration (days)' },
  schemeFloorBoost: { default: 1.15, min: 1, max: 5, step: 0.01, label: 'Scheme floor boost' },
  schemeStandingFloor: { default: -60, min: -100, max: 0, label: 'Scheme standing floor' },
});

export function austerityLiftCp(world: World): number {
  const wages = world.monsters.reduce((n, m) => n + (m.alive ? m.wageCpPerDay : 0), 0);
  return Math.max(DUNGEON.austerityLiftCp, Math.round(wages * 1.5));
}
const SCHEME_KINDS = ['bankrupt', 'blood_quota', 'stop_descent', 'toll_harvest'];

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
    0.015 * ((DUNGEON.revenueTargetCp - d.revenueEmaCp) / DUNGEON.revenueTargetCp) - 0.02 * (lethality - 0.22);

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
    d.loanCp = DUNGEON.loanCp;
    d.treasuryCp += DUNGEON.loanCp;
    d.mintedCp += DUNGEON.loanCp;
    d.loanTakenTick = world.tick;
    adjustKhanStanding(world, -5);
    emit(world, {
      type: 'KHAN_LOAN',
      payload: { cp: DUNGEON.loanCp, action: 'taken', text: keeperLine(world, 'loan_taken') },
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

  if (d.austerity && d.treasuryCp >= austerityLiftCp(world)) {
    d.austerity = false;
    emit(world, {
      type: 'KEEPER_DECREE',
      payload: { decree: 'wages_resume', text: 'wages resume, the arrears quietly forgotten' },
    });
  }

  if (d.treasuryCp > DUNGEON.repayFloorCp && d.loanCp > 0) {
    const pay = Math.min(d.loanCp, Math.floor((d.treasuryCp - DUNGEON.repayFloorCp) * 0.25));
    if (pay <= 0) return;
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
  return DUNGEON.schemeFloorBoost;
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
    deadlineTick: world.tick + DUNGEON.schemeDays * DAY_TICKS,
    outcome: '',
  };
  d.scheme = scheme;
  adjustStanding(target, -10);

  emit(world, {
    type: 'KEEPER_SCHEME_SET',
    teamId: target.id,
    payload: { name, kind, team: target.name, goal, days: DUNGEON.schemeDays },
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
  if (target && !gone && target.standing > DUNGEON.schemeStandingFloor) adjustStanding(target, -1);

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

