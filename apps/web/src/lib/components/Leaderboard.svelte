<script lang="ts">
  import { teamColor } from '../design/teams.js';
  import { useSim } from '../store.svelte.js';

  const sim = useSim();

  function medal(rank: number): string {
    return rank === 1 ? 'text-rank-gold' : rank === 2 ? 'text-rank-silver' : rank === 3 ? 'text-rank-bronze' : 'text-stone-400';
  }
</script>

<section class="flex min-h-0 flex-col" aria-label="Leaderboard">
  <h2 class="shrink-0 border-b-2 border-ink-900 px-3 py-1.5 text-label text-parchment-300">
    LEADERBOARD
  </h2>
  <ol class="min-h-0 flex-1 overflow-y-auto px-1 py-1">
    {#each sim.leaderboard as row (row.teamId)}
      <li>
        <button
          type="button"
          onclick={() => {
            sim.selectedTeam = sim.selectedTeam === row.teamId ? null : row.teamId;
          }}
          class="grid h-9 w-full grid-cols-[24px_10px_1fr_28px_64px] items-center gap-2 rounded-sm px-2 text-left hover:bg-parchment-100/10"
          class:bg-parchment-100={sim.selectedTeam === row.teamId}
          class:text-ink={sim.selectedTeam === row.teamId}
        >
          <span class="font-mono text-body-sm {medal(row.rank)}">{row.rank}</span>
          <span
            class="size-2.5 rounded-full border border-ink-900"
            style="background: {teamColor(row.colorIndex)}"
          ></span>
          <span class="truncate text-body-sm">{row.name}</span>
          <span class="font-mono text-micro text-stone-400">F{row.deepestFloor}</span>
          <span class="text-right font-mono text-micro text-rank-gold">{row.renown}</span>
        </button>
      </li>
    {:else}
      <li class="px-3 py-4 text-center text-body-sm text-stone-500">No teams ranked yet.</li>
    {/each}
  </ol>
</section>
