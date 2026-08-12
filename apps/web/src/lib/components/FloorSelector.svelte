<script lang="ts">
  import { useSim } from '../store.svelte.js';

  const sim = useSim();
</script>

<nav
  class="flex w-10 min-h-0 shrink-0 flex-col overflow-y-auto border-r-2 border-ink-900 bg-stone-900/60"
  aria-label="Floors"
>
  {#each sim.floors as floor (floor.id)}
    <button
      type="button"
      onclick={() => (sim.selectedFloor = floor.id)}
      aria-current={sim.selectedFloor === floor.id ? 'true' : undefined}
      title="{floor.name} — {floor.teamCount} teams, {floor.roomCount} rooms"
      class="flex h-10 shrink-0 flex-col items-center justify-center border-b border-ink-900/60 font-mono text-micro transition-colors"
      class:bg-torch-400={sim.selectedFloor === floor.id}
      class:text-ink-900={sim.selectedFloor === floor.id}
      class:text-stone-400={sim.selectedFloor !== floor.id}
    >
      <span>F{floor.depth}</span>
      {#if floor.teamCount > 0}
        <span class="text-[9px] opacity-80">{floor.teamCount}</span>
      {/if}
    </button>
  {/each}
</nav>
