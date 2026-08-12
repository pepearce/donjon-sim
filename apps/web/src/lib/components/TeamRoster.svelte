<script lang="ts">
  import { useSim } from '../store.svelte.js';
  import TeamCard from './TeamCard.svelte';

  const sim = useSim();
  const MOVE_TICKS = 90;

  interface Mark {
    rank: number;
    dir: number;
    at: number;
  }

  const marks = new Map<number, Mark>();
  let moves = $state<Record<number, number>>({});

  const rankById = $derived(new Map(sim.leaderboard.map((row) => [row.teamId, row.rank])));

  const lead = $derived(
    sim.leaderboard.length < 2
      ? 0
      : (sim.leaderboard[0]?.renown ?? 0) - (sim.leaderboard[1]?.renown ?? 0),
  );

  $effect(() => {
    const rows = sim.leaderboard;
    const now = sim.tick;
    const seen = new Set<number>();
    const next: Record<number, number> = {};

    for (const row of rows) {
      seen.add(row.teamId);
      const mark = marks.get(row.teamId);
      if (mark === undefined) {
        marks.set(row.teamId, { rank: row.rank, dir: 0, at: now });
        continue;
      }
      if (mark.rank !== row.rank) {
        mark.dir = mark.rank > row.rank ? 1 : -1;
        mark.at = now;
        mark.rank = row.rank;
      } else if (mark.dir !== 0 && now - mark.at > MOVE_TICKS) {
        mark.dir = 0;
      }
      if (mark.dir !== 0) next[row.teamId] = mark.dir;
    }

    for (const teamId of [...marks.keys()]) {
      if (!seen.has(teamId)) marks.delete(teamId);
    }

    const before = Object.keys(moves);
    const after = Object.keys(next);
    const same =
      before.length === after.length && after.every((k) => moves[Number(k)] === next[Number(k)]);
    if (!same) moves = next;
  });

  const ranked = $derived(
    [...sim.teams].sort((a, b) => {
      const aliveA = a.heroes.filter((h) => h.alive).length;
      const aliveB = b.heroes.filter((h) => h.alive).length;
      if ((aliveA === 0) !== (aliveB === 0)) return aliveA === 0 ? 1 : -1;
      const rankA = rankById.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const rankB = rankById.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (rankA !== rankB) return rankA - rankB;
      return a.id - b.id;
    }),
  );
</script>

<section class="flex h-full min-h-0 flex-col" aria-label="Teams">
  <header class="flex shrink-0 items-baseline gap-2 border-b-2 border-ink-900 px-3 py-1.5">
    <h2 class="font-display text-title leading-none text-parchment-200">THE FIELD</h2>
    <p class="ml-auto font-mono text-micro text-stone-500">
      {#if sim.leaderboard.length < 2}
        NO CONTEST
      {:else if lead === 0}
        DEAD HEAT
      {:else}
        LEAD +{lead}
      {/if}
    </p>
  </header>

  <div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
    {#each ranked as team (team.id)}
      <TeamCard {team} rank={rankById.get(team.id) ?? 0} move={moves[team.id] ?? 0} />
    {:else}
      <p class="px-1 py-4 text-body-sm text-stone-500 italic">
        No companies in the dungeon. The tavern is full and the tolls are unpaid.
      </p>
    {/each}
  </div>
</section>
