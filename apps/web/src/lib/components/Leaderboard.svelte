<script lang="ts">
  import { teamColor } from '../design/teams.js';
  import { useSim } from '../store.svelte.js';

  const sim = useSim();
  const MOVE_TICKS = 90;

  interface Mark {
    rank: number;
    dir: number;
    at: number;
  }

  const marks = new Map<number, Mark>();
  let moves = $state<Record<number, number>>({});

  const leaderRenown = $derived(Math.max(1, sim.leaderboard[0]?.renown ?? 1));
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

  function medal(rank: number): string {
    return rank === 1
      ? 'text-rank-gold'
      : rank === 2
        ? 'text-rank-silver'
        : rank === 3
          ? 'text-rank-bronze'
          : 'text-stone-400';
  }

  function select(teamId: number): void {
    sim.selectedTeam = sim.selectedTeam === teamId ? null : teamId;
  }
</script>

<section class="flex h-full min-h-0 flex-col" aria-label="Leaderboard">
  <header class="flex shrink-0 items-baseline gap-2 border-b-2 border-ink-900 px-3 py-1.5">
    <h2 class="text-label text-parchment-300">LEADERBOARD</h2>
    <p class="ml-auto font-mono text-micro text-stone-400">
      {#if sim.leaderboard.length < 2}
        NO CONTEST
      {:else if lead === 0}
        DEAD HEAT
      {:else}
        LEAD +{lead}
      {/if}
    </p>
  </header>
  <p class="shrink-0 px-3 pt-1 font-mono text-micro text-stone-600">SELECT A ROW TO OPEN ITS FILE</p>
  <ol class="min-h-0 flex-1 overflow-y-auto px-1 py-1">
    {#each sim.leaderboard as row (row.teamId)}
      {@const chosen = sim.selectedTeam === row.teamId}
      {@const move = moves[row.teamId] ?? 0}
      <li>
        <button
          type="button"
          onclick={() => select(row.teamId)}
          aria-pressed={chosen}
          class="relative grid h-9 w-full grid-cols-[22px_12px_10px_1fr_28px_60px] items-center gap-2 overflow-hidden rounded-sm px-2 text-left hover:bg-parchment-100/10"
          class:bg-parchment-100={chosen}
          class:text-ink={chosen}
        >
          <span class="sr-only">
            Rank {row.rank}, {row.name}, renown {row.renown}, deepest floor {row.deepestFloor},
            {row.alive} standing{move === 1 ? ', moved up' : move === -1 ? ', moved down' : ''}
          </span>
          <span
            aria-hidden="true"
            class="absolute inset-y-0 left-0 opacity-15"
            style="width: {Math.round((row.renown / leaderRenown) * 100)}%; background: {teamColor(
              row.colorIndex,
            )}"
          ></span>
          <span aria-hidden="true" class="relative font-mono text-body-sm {medal(row.rank)}">
            {row.rank}
          </span>
          <span
            aria-hidden="true"
            class="relative font-mono text-micro"
            class:text-poison-400={move === 1}
            class:text-blood-400={move === -1}
            class:text-stone-500={move === 0}
          >
            {move === 1 ? '▲' : move === -1 ? '▼' : '·'}
          </span>
          <span
            aria-hidden="true"
            class="relative size-2.5 rounded-full border border-ink-900"
            style="background: {teamColor(row.colorIndex)}"
          ></span>
          {#if chosen}
            <span aria-hidden="true" class="absolute inset-y-0 left-0 w-1 bg-torch-400"></span>
          {/if}
          <span aria-hidden="true" class="relative truncate text-body-sm">{row.name}</span>
          <span aria-hidden="true" class="relative font-mono text-micro text-stone-400">
            F{row.deepestFloor}
          </span>
          <span aria-hidden="true" class="relative text-right font-mono text-micro text-rank-gold">
            {row.renown}
          </span>
        </button>
      </li>
    {:else}
      <li class="px-3 py-4 text-center text-body-sm text-stone-500">No teams ranked yet.</li>
    {/each}
  </ol>
</section>
