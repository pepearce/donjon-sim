<script lang="ts">
  import type { EventDTO } from '@donjon/shared';
  import { useSim } from '../store.svelte.js';

  const sim = useSim();

  const FILTERS = ['all', 'combat', 'loot', 'deaths', 'keeper'] as const;
  type Filter = (typeof FILTERS)[number];

  let filter = $state<Filter>('all');
  let paused = $state(false);
  let frozen = $state<EventDTO[]>([]);

  const COMBAT = new Set(['COMBAT_START', 'COMBAT_ROUND', 'COMBAT_END', 'MONSTER_DOWN', 'ROOM_CLEARED']);
  const LOOT = new Set(['LOOT_FOUND', 'TOLL_PAID', 'TRAP_DISARMED']);
  const DEATHS = new Set(['HERO_DOWN', 'HERO_DEATH', 'TEAM_WIPE', 'TRAP_SPRUNG']);
  const KEEPER = new Set(['KEEPER_DECREE', 'KHAN_LOAN', 'CORPSE_TAX_LEVIED', 'WAGE_PAID', 'ENTRY_FEE_PAID', 'DUNGEON_RESTOCK']);

  function tone(type: string): string {
    if (DEATHS.has(type)) return 'text-blood-300';
    if (LOOT.has(type)) return 'text-rank-gold';
    if (KEEPER.has(type)) return 'text-arcane-300';
    if (COMBAT.has(type)) return 'text-torch-200';
    return 'text-parchment-200';
  }

  function glyph(type: string): string {
    if (type === 'HERO_DEATH' || type === 'TEAM_WIPE') return '☠';
    if (DEATHS.has(type)) return '✚';
    if (LOOT.has(type)) return '◈';
    if (KEEPER.has(type)) return '§';
    if (COMBAT.has(type)) return '⚔';
    if (type === 'FLOOR_DESCEND') return '↓';
    if (type === 'FLOOR_ASCEND') return '↑';
    return '·';
  }

  const teamHeroIds = $derived(
    sim.selectedTeam === null
      ? null
      : new Set(sim.teams.find((t) => t.id === sim.selectedTeam)?.heroes.map((h) => h.id) ?? []),
  );

  const matching = $derived(
    sim.ticker.filter((e) => {
      if (sim.selectedTeam !== null) {
        const mine = e.teamId === sim.selectedTeam || (e.heroId !== null && teamHeroIds?.has(e.heroId));
        if (!mine) return false;
      }
      if (filter === 'all') return true;
      if (filter === 'combat') return COMBAT.has(e.type);
      if (filter === 'loot') return LOOT.has(e.type);
      if (filter === 'deaths') return DEATHS.has(e.type);
      return KEEPER.has(e.type);
    }),
  );

  const rows = $derived(paused ? frozen : matching.slice(-60).reverse());

  const digest = $derived(
    sim.ticker
      .filter((e) => e.severity >= 2)
      .slice(-3)
      .map((e) => e.text)
      .join('. '),
  );

  function togglePause(): void {
    frozen = matching.slice(-60).reverse();
    paused = !paused;
  }
</script>

<section class="flex min-h-0 flex-col border-2 border-ink-900 bg-stone-900" aria-label="Event feed">
  <header class="flex shrink-0 items-center gap-1 border-b-2 border-ink-900 px-2 py-1">
    <h2 class="mr-2 text-label text-parchment-300">EVENTS</h2>
    {#if sim.selectedTeam !== null}
      {@const team = sim.teams.find((t) => t.id === sim.selectedTeam)}
      <button
        type="button"
        onclick={() => (sim.selectedTeam = null)}
        class="mr-1 rounded-full border border-torch-400 px-2 py-0.5 text-micro text-torch-300"
        title="Show all teams again"
      >
        {team?.name ?? 'team'} ✕
      </button>
    {/if}
    {#each FILTERS as f (f)}
      <button
        type="button"
        onclick={() => (filter = f)}
        class="rounded-full border px-2 py-0.5 text-micro transition-colors"
        class:border-torch-400={filter === f}
        class:text-torch-300={filter === f}
        class:border-stone-700={filter !== f}
        class:text-stone-400={filter !== f}
      >
        {f}
      </button>
    {/each}
    <button
      type="button"
      onclick={togglePause}
      class="ml-auto rounded-full border border-stone-700 px-2 py-0.5 text-micro text-stone-400"
      aria-pressed={paused}
    >
      {paused ? '▶ resume' : '⏸ pause'}
    </button>
  </header>

  <ol class="min-h-0 flex-1 overflow-y-auto px-2 py-1 font-mono text-table" role="log" aria-live="off">
    {#each rows as event (event.id)}
      <li class="flex items-baseline gap-2 px-1 py-0.5">
        <span class="shrink-0 text-stone-600">t{String(event.tick).padStart(6, '0')}</span>
        <span aria-hidden="true" class="shrink-0 {tone(event.type)}">{glyph(event.type)}</span>
        <span class={tone(event.type)}>{event.text}</span>
      </li>
    {:else}
      <li class="px-1 py-4 text-center text-stone-500">Nothing yet.</li>
    {/each}
  </ol>

  <p class="sr-only" aria-live="polite" aria-atomic="true">{digest}</p>
</section>
