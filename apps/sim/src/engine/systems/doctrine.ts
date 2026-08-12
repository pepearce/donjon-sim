import { RngDomain, mix32, rngFor } from '@donjon/shared';
import { livingRoster } from '../world.js';
import { traitFrac } from './traits.js';
import { clamp, type Team, type World } from '../types.js';

export interface Doctrine {
  wanderlust: number;
  avarice: number;
  caution: number;
  patience: number;
}

export function doctrineFor(world: World, team: Team): Doctrine {
  const rng = rngFor(world.seed, 0, RngDomain.TEAM_DOCTRINE, team.id);
  const base = {
    wanderlust: rng.float(),
    avarice: rng.float(),
    caution: rng.float(),
    patience: rng.float(),
  };

  const crew = livingRoster(world, team);
  const cautious = traitFrac(crew, 'cautious');
  const bold = traitFrac(crew, 'bold');
  const craven = traitFrac(crew, 'craven');
  const greedy = traitFrac(crew, 'greedy');
  const hoarder = traitFrac(crew, 'hoarder');
  const glory = traitFrac(crew, 'glory_hound');
  const reckless = traitFrac(crew, 'reckless');

  return {
    wanderlust: clamp(0, 1, base.wanderlust + 0.3 * glory + 0.2 * bold - 0.25 * cautious),
    avarice: clamp(0, 1, base.avarice + 0.35 * greedy + 0.25 * hoarder + 0.15 * team.greed),
    caution: clamp(0, 1, base.caution + 0.4 * cautious + 0.3 * craven - 0.35 * bold - 0.3 * reckless),
    patience: clamp(0, 1, base.patience + 0.3 * cautious - 0.3 * glory - 0.2 * reckless),
  };
}

export function roomNoise(seed: number, teamId: number, floorId: number, roomIdx: number): number {
  return mix32(seed ^ mix32(teamId * 0x9e3779b1 + floorId * 0x85ebca6b + roomIdx * 0xc2b2ae35)) / 4294967296;
}

export function moraleBaseline(world: World, team: Team, doctrine: Doctrine): number {
  const crew = livingRoster(world, team);
  return clamp(
    30,
    75,
    55 + 12 * traitFrac(crew, 'bold') - 12 * traitFrac(crew, 'craven') - 8 * traitFrac(crew, 'superstitious') + 8 * doctrine.patience,
  );
}

export function driftMorale(world: World): void {
  for (const team of world.teams) {
    if (team.state === 'disbanded') continue;
    if (livingRoster(world, team).length === 0) continue;
    const baseline = moraleBaseline(world, team, doctrineFor(world, team));
    if (team.morale < baseline) team.morale = clamp(0, 100, team.morale + 1);
    else if (team.morale > baseline) team.morale = clamp(0, 100, team.morale - 1);
  }
}
