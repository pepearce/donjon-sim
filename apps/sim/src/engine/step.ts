import { DAY_TICKS, DECAY_EVERY } from '@donjon/shared';
import { emit } from './emit.js';
import { attemptStabilise, resolveCombatRound } from './systems/combat.js';
import { resolveBleedOut, sweepCorpse } from './systems/death.js';
import { bankLoot, dailyUpkeep, payEntryFee, restAndHeal } from './systems/economy.js';
import { issueDecree, resolveLoan, updateAggression, updateFameAndNotoriety, updateKeeperMood } from './systems/dungeon.js';
import { advanceTeam, ascend, descend, repath } from './systems/movement.js';
import { decayRenown, rankTeams } from './systems/ranking.js';
import { activeTeamCount, arrivals, formTeams, retireStragglers } from './systems/recruit.js';
import { resolveRestock } from './systems/restock.js';
import { armTrap } from './systems/traps.js';
import { COMMIT_TICKS, chooseAction } from './systems/teamAi.js';
import { floorOf, livingRoster, roster } from './world.js';
import { clamp, type Team, type World } from './types.js';

const DISBAND_BROKE_TICKS = DAY_TICKS * 3;
const DISBAND_MORALE_TICKS = 1800;

function drainScheduler(world: World): void {
  for (const wake of world.scheduler.popDue(world.tick)) {
    switch (wake.kind) {
      case 'BLEED_OUT':
        resolveBleedOut(world, wake.entityId);
        break;
      case 'CORPSE_SWEEP':
        sweepCorpse(world, wake.entityId);
        break;
      case 'RESTOCK':
        resolveRestock(world, wake.entityId);
        break;
      case 'TRAP_REARM':
        for (const floor of world.floors) {
          const room = floor.rooms.find((r) => r.id === wake.entityId);
          if (room) {
            armTrap(world, room, floor.depth);
            break;
          }
        }
        break;
      default:
        break;
    }
  }
}

function travelTowards(world: World, team: Team, floor: Parameters<typeof repath>[2], destination: number): void {
  if (team.pathPos < team.path.length) {
    advanceTeam(world, team);
    return;
  }
  if (team.targetRoom !== team.roomIdx) {
    advanceTeam(world, team);
    return;
  }
  repath(world, team, floor, destination);
  advanceTeam(world, team);
}

function applyAction(world: World, team: Team): void {
  const floor = floorOf(world, team.floorId);
  if (!floor) return;

  const action = chooseAction(world, team);
  if (action !== team.lastAction) {
    team.lastAction = action;
    team.commitUntilTick = world.tick + (COMMIT_TICKS[action] ?? 4);
  }

  switch (action) {
    case 'REST':
      team.state = 'resting';
      team.restUntilTick = world.tick + 30;
      restAndHeal(world, team);
      return;
    case 'FLEE': {
      team.state = 'fleeing';
      travelTowards(world, team, floor, floor.entryRoom);
      team.morale = clamp(0, 100, team.morale - 1);
      return;
    }
    case 'RETREAT':
      team.state = 'delving';
      if (team.roomIdx === floor.entryRoom) {
        if (floor.depth > 1) {
          ascend(world, team, floor);
        } else {
          team.lastAction = 'EXPLORE';
          team.commitUntilTick = world.tick + COMMIT_TICKS.EXPLORE;
          advanceTeam(world, team);
        }
        return;
      }
      travelTowards(world, team, floor, floor.entryRoom);
      return;
    case 'DESCEND':
      team.state = 'delving';
      if (team.roomIdx === floor.stairsRoom) descend(world, team, floor);
      else travelTowards(world, team, floor, floor.stairsRoom);
      return;
    default:
      team.state = 'delving';
      advanceTeam(world, team);
  }
}

function maybeDisband(world: World, team: Team): void {
  const crew = roster(world, team);
  const alive = crew.filter((h) => h.state !== 'dead');
  const reasons: string[] = [];

  if (alive.length < 2) reasons.push('too few survivors');
  if (team.goldCp < 0 && world.tick - team.formedTick > DISBAND_BROKE_TICKS) reasons.push('insolvent');
  if (team.morale < 12 && world.tick - team.formedTick > DISBAND_MORALE_TICKS) reasons.push('morale collapse');

  if (reasons.length === 0) return;

  team.state = 'disbanded';
  team.disbandedTick = world.tick;
  emit(world, {
    type: 'TEAM_DISBANDED',
    teamId: team.id,
    payload: { team: team.name, reason: reasons[0] ?? 'unknown' },
  });
}

export function step(world: World): void {
  world.tick += 1;

  drainScheduler(world);

  const active = world.teams.filter((t) => t.state !== 'disbanded').sort((a, b) => a.id - b.id);

  for (const team of active) {
    if (team.state !== 'fighting') continue;
    attemptStabilise(world, team);
    resolveCombatRound(world, team);
  }

  for (const team of active) {
    if (team.state === 'fighting') continue;
    if (livingRoster(world, team).length === 0) continue;

    if (team.state === 'resting' && world.tick < team.restUntilTick) {
      restAndHeal(world, team);
      continue;
    }

    if (world.tick >= team.commitUntilTick || team.state === 'resting') {
      applyAction(world, team);
    } else {
      advanceTeam(world, team);
    }
  }

  for (const team of active) maybeDisband(world, team);

  retireStragglers(world);
  arrivals(world);
  formTeams(world);

  if (world.tick % DECAY_EVERY === 0) {
    decayRenown(world);
    rankTeams(world);
    updateFameAndNotoriety(world);
    resolveLoan(world);
    updateKeeperMood(world);
  }

  if (world.tick % DAY_TICKS === 0) {
    dailyUpkeep(world);
    updateAggression(world, world.dungeon.heroesSlain, Math.max(1, activeTeamCount(world)));
    issueDecree(world);
  }
}
