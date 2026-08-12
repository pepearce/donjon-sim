import { DAY_TICKS } from '@donjon/shared';
import { pushHistory, type Team, type World } from '../types.js';

function rankedRecently(world: World, team: Team): boolean {
  for (let i = team.history.length - 1; i >= 0; i--) {
    const entry = team.history[i];
    if (!entry || entry.k !== 'rank') continue;
    return world.tick - entry.t < DAY_TICKS;
  }
  return false;
}

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
    const next = index + 1;
    if (next <= 3 && (team.rank === 0 || next < team.rank) && !rankedRecently(world, team)) {
      pushHistory(team, world.tick, 'rank', `${team.name} climbed to rank ${next} on the board.`);
    }
    team.rank = next;
  });

  for (const team of world.teams) {
    if (team.state === 'disbanded') team.rank = 0;
  }
}
