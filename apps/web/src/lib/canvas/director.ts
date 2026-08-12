import type { TeamPublic } from '@donjon/shared';
import { dramaWeight, type DramaBeat } from './fx.js';

export const DWELL_MS = 5200;
export const DRAMA_WINDOW_MS = 14_000;
export const CUT_MARGIN = 10;
export const CUT_RATIO = 1.2;

export interface DirectorState {
  teamId: number | null;
  cutAt: number;
  score: number;
}

export interface DirectorInput {
  teams: readonly TeamPublic[];
  drama: readonly DramaBeat[];
  now: number;
}

export function createDirectorState(): DirectorState {
  return { teamId: null, cutAt: 0, score: 0 };
}

function partyHealth(team: TeamPublic): number {
  let hp = 0;
  let max = 0;
  for (const hero of team.heroes) {
    if (!hero.alive) continue;
    hp += Math.max(0, hero.hp);
    max += Math.max(1, hero.hpMax);
  }
  if (max === 0) return 0;
  return hp / max;
}

export function scoreTeam(
  team: TeamPublic,
  drama: readonly DramaBeat[],
  now: number,
  peakDepth: number,
  peakHaul: number,
): number {
  if (team.state === 'disbanded' || team.state === 'recruiting') return 0;

  let score = 6;
  if (team.state === 'fighting') score += 44;
  else if (team.state === 'fleeing') score += 34;
  else if (team.state === 'delving') score += 12;
  else if (team.state === 'resting') score += 2;

  const alive = team.heroes.filter((h) => h.alive).length;
  if (alive === 0) return 0;
  if (alive === 1 && team.heroes.length > 1) score += 22;

  const health = partyHealth(team);
  if (health < 0.55) score += (0.55 - health) * 80;

  const downed = team.heroes.filter((h) => !h.alive).length;
  score += Math.min(3, downed) * 9;

  if (team.morale < 30) score += 10;

  if (peakDepth > 0 && team.deepestFloor >= peakDepth) score += 14;
  if (peakHaul > 0 && team.carriedCp >= peakHaul * 0.9) score += 12;

  for (const beat of drama) {
    if (beat.teamId !== team.id) continue;
    const age = now - beat.born;
    if (age < 0 || age > DRAMA_WINDOW_MS) continue;
    const decay = 1 - age / DRAMA_WINDOW_MS;
    score += dramaWeight(beat.type, beat.severity) * decay;
  }

  return score;
}

export function pickTeam(state: DirectorState, input: DirectorInput): DirectorState {
  const { teams, drama, now } = input;
  if (teams.length === 0) return { teamId: null, cutAt: state.cutAt, score: 0 };

  let peakDepth = 0;
  let peakHaul = 0;
  for (const t of teams) {
    if (t.deepestFloor > peakDepth) peakDepth = t.deepestFloor;
    if (t.carriedCp > peakHaul) peakHaul = t.carriedCp;
  }

  let best: TeamPublic | null = null;
  let bestScore = -1;
  let currentScore = -1;

  for (const team of teams) {
    const score = scoreTeam(team, drama, now, peakDepth, peakHaul);
    if (team.id === state.teamId) currentScore = score;
    if (score > bestScore) {
      bestScore = score;
      best = team;
    }
  }

  if (!best || bestScore <= 0) return { teamId: state.teamId, cutAt: state.cutAt, score: currentScore };

  if (state.teamId === null || currentScore <= 0) {
    return { teamId: best.id, cutAt: now, score: bestScore };
  }

  if (best.id === state.teamId) return { teamId: state.teamId, cutAt: state.cutAt, score: bestScore };

  if (now - state.cutAt < DWELL_MS) {
    return { teamId: state.teamId, cutAt: state.cutAt, score: currentScore };
  }

  if (bestScore > currentScore * CUT_RATIO + CUT_MARGIN) {
    return { teamId: best.id, cutAt: now, score: bestScore };
  }

  return { teamId: state.teamId, cutAt: state.cutAt, score: currentScore };
}
