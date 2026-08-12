<script lang="ts">
  import { DAY_TICKS } from '@donjon/shared';
  import { useSim } from '../store.svelte.js';

  const sim = useSim();

  const epithets = $derived.by(() => {
    const map = new Map<number, string>();
    for (const team of sim.teams) {
      for (const hero of team.heroes) {
        if (hero.epithet) map.set(hero.id, hero.epithet);
      }
    }
    return map;
  });

  const causes = $derived.by(() => {
    const map = new Map<number, string>();
    for (const e of sim.ticker) {
      if (e.heroId === null || e.type !== 'HERO_DEATH') continue;
      map.set(e.heroId, e.text);
    }
    return map;
  });
</script>

<ul class="px-3 py-1" aria-label="Hero memorial">
    {#each sim.memorial as hero (hero.id)}
      {@const epithet = epithets.get(hero.id)}
      {@const cause = causes.get(hero.id)}
      <li class="border-b border-ink-900/40 py-1.5 last:border-0">
        <p class="flex items-baseline gap-1.5">
          <span aria-hidden="true" class="shrink-0 text-blood-400">†</span>
          <span class="truncate font-display text-body text-parchment-100">{hero.name}</span>
          {#if epithet}
            <span class="truncate text-micro text-torch-300 italic">{epithet}</span>
          {/if}
          <span class="ml-auto shrink-0 font-mono text-micro text-stone-600">
            DAY {Math.floor(hero.diedTick / DAY_TICKS)}
          </span>
        </p>
        <p class="pl-4 font-mono text-micro tabular text-stone-500">
          L{hero.level}
          <span class="text-stone-400">{hero.species} {hero.className}</span>
          · {hero.kills}
          {hero.kills === 1 ? 'kill' : 'kills'}
        </p>
        <p class="truncate pl-4 text-micro text-stone-500">{hero.teamName}</p>
        {#if cause}
          <p class="mt-0.5 line-clamp-2 border-l-2 border-blood-700 pl-2 text-micro text-stone-400 italic">
            {cause}
          </p>
        {/if}
      </li>
    {:else}
      <li class="py-4 text-body-sm text-stone-500 italic">Nobody has died yet. Give it time.</li>
    {/each}
  </ul>
