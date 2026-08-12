<script lang="ts">
  import { useSim } from '../store.svelte.js';

  const sim = useSim();
</script>

<section class="flex min-h-0 flex-col border-t-2 border-ink-900" aria-label="Hero memorial">
  <h2 class="flex shrink-0 items-baseline justify-between border-b-2 border-ink-900 px-3 py-1.5">
    <span class="text-label text-parchment-300">THE FALLEN</span>
    <span class="font-mono text-body-sm text-blood-300">{sim.casualties}</span>
  </h2>
  <ul class="min-h-0 flex-1 overflow-y-auto px-3 py-1">
    {#each sim.memorial as hero (hero.id)}
      <li class="border-b border-ink-900/40 py-1 last:border-0">
        <div class="flex items-baseline gap-1.5">
          <span aria-hidden="true" class="text-stone-500">†</span>
          <span class="truncate text-body-sm text-parchment-200">{hero.name}</span>
        </div>
        <p class="pl-4 font-mono text-micro text-stone-500">
          L{hero.level} {hero.className} · {hero.kills} kills · {hero.teamName}
        </p>
      </li>
    {:else}
      <li class="py-4 text-center text-body-sm text-stone-500">Nobody has died yet. Give it time.</li>
    {/each}
  </ul>
</section>
