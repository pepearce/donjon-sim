import type { Team, World } from '../types.js';

export const DECAY_NUM = 9985;
export const DECAY_DEN = 10_000;

export function decayRenown(world: World): void {
  for (const team of world.teams) {
    team.renownMilli = Math.floor((team.renownMilli * DECAY_NUM) / DECAY_DEN);
    if (team.renownMilli > team.peakRenownMilli) team.peakRenownMilli = team.renownMilli;
    if (team.renownMilli < 0) team.renownMilli = 0;
  }
}

export function rankTeams(world: World): void {
  const ordered = world.teams
    .filter((t) => t.state !== 'disbanded')
    .sort(
      (a: Team, b: Team) =>
        b.renownMilli - a.renownMilli ||
        b.deepestFloor - a.deepestFloor ||
        b.goldCp - a.goldCp ||
        a.id - b.id,
    );

  ordered.forEach((team, index) => {
    team.rank = index + 1;
  });

  for (const team of world.teams) {
    if (team.state === 'disbanded') team.rank = 0;
  }
}
