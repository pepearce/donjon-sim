<script lang="ts">
  import { onMount } from 'svelte';
  import ConnectionBanner from '$lib/components/ConnectionBanner.svelte';
  import EventTicker from '$lib/components/EventTicker.svelte';
  import KeeperPanel from '$lib/components/KeeperPanel.svelte';
  import Leaderboard from '$lib/components/Leaderboard.svelte';
  import MapPanel from '$lib/components/MapPanel.svelte';
  import Memorial from '$lib/components/Memorial.svelte';
  import SpeedControl from '$lib/components/SpeedControl.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import TeamCard from '$lib/components/TeamCard.svelte';
  import { connect } from '$lib/connection.svelte.js';
  import { createMotion } from '$lib/applyFrame.js';
  import { createSimStore, setMotion } from '$lib/store.svelte.js';

  let { data } = $props();

  const sim = createSimStore();

  if (data.bootstrap) sim.applyBootstrap(data.bootstrap);
  if (data.floorMap) {
    sim.floorMap = data.floorMap;
    sim.selectedFloor = data.floorMap.id;
  }

  const motion = createMotion();
  setMotion(motion);

  onMount(() => {
    const connection = connect(sim, motion);
    return () => connection.close();
  });

  const sortedTeams = $derived(
    [...sim.teams].sort((a, b) => {
      const aliveA = a.heroes.filter((h) => h.alive).length;
      const aliveB = b.heroes.filter((h) => h.alive).length;
      if (aliveA === 0 !== (aliveB === 0)) return aliveA === 0 ? 1 : -1;
      return a.id - b.id;
    }),
  );
</script>

<svelte:head><title>Donjon Sim — live</title></svelte:head>

<svelte:window
  onkeydown={(e) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === '[') sim.selectedFloor = Math.max(1, sim.selectedFloor - 1);
    else if (e.key === ']') sim.selectedFloor = Math.min(sim.floors.length, sim.selectedFloor + 1);
    else if (e.key === 'Escape') sim.selectedTeam = null;
  }}
/>

<a
  href="/text"
  class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2 focus:text-ink"
>
  View this dungeon as a text page
</a>
<a
  href="#roster"
  class="sr-only focus:not-sr-only focus:absolute focus:left-56 focus:top-2 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2 focus:text-ink"
>
  Skip to teams
</a>

<p class="sr-only" role="status" aria-live="assertive">
  {sim.connection === 'stale' || sim.connection === 'offline'
    ? 'Connection to the simulation lost. The board is frozen.'
    : ''}
</p>

<div class="dash-grid" class:is-stale={sim.isStale}>
  <header
    class="flex h-14 items-center gap-5 overflow-x-auto border-2 border-ink-900 bg-stone-900 px-4 shadow-ink"
    style="grid-area: topbar"
  >
    <h1 class="shrink-0 font-display text-display-sm text-torch-300">DONJON</h1>
    <StatCard label="FALLEN" value={sim.casualties} tone="danger" />
    <StatCard label="HEROES" value={sim.heroesLiving} hint="{sim.tavernSize} in the tavern" />
    <StatCard label="TEAMS" value="{sim.teams.length}/10" />
    <StatCard label="TREASURY" value={(sim.keeper?.treasuryCp ?? 0).toLocaleString()} tone="gold" />
    <StatCard label="DAY" value={sim.day} hint={sim.watch.toLowerCase()} />
    <StatCard label="DEEPEST" value="F{Math.max(1, ...sim.floors.map((f) => f.depth))}" />
    <div class="ml-auto flex shrink-0 items-center gap-3">
      <SpeedControl />
      <ConnectionBanner />
    </div>
  </header>

  <aside
    id="roster"
    class="flex min-h-0 flex-col gap-2 overflow-y-auto border-2 border-ink-900 bg-stone-900 p-2"
    style="grid-area: roster"
    aria-label="Teams"
  >
    <h2 class="text-label text-parchment-300">TEAMS &amp; LOOT</h2>
    {#each sortedTeams as team (team.id)}
      <TeamCard {team} />
    {:else}
      <p class="text-body-sm text-stone-500">No teams in the dungeon.</p>
    {/each}
  </aside>

  <div class="flex min-h-0 flex-col border-2 border-ink-900 bg-stone-950" style="grid-area: map">
    <MapPanel />
  </div>

  <div style="grid-area: ticker" class="min-h-0">
    <EventTicker />
  </div>

  <aside
    class="flex min-h-0 flex-col border-2 border-ink-900 bg-stone-900"
    style="grid-area: rail"
    aria-label="Rankings and dungeon status"
  >
    <div class="min-h-0 flex-1"><Leaderboard /></div>
    <KeeperPanel />
    <div class="min-h-0 flex-1"><Memorial /></div>
  </aside>
</div>

<style>
  .dash-grid {
    display: grid;
    height: 100dvh;
    gap: 0.75rem;
    padding: 0.75rem;
    grid-template-columns: 336px minmax(480px, 1fr) 340px;
    grid-template-rows: 3.5rem minmax(0, 1fr) 200px;
    grid-template-areas:
      'topbar topbar topbar'
      'roster map rail'
      'roster ticker rail';
  }

  @media (max-width: 1279px) {
    .dash-grid {
      grid-template-columns: minmax(0, 1fr) 320px;
      grid-template-rows: 3.5rem minmax(0, 1fr) 180px;
      grid-template-areas:
        'topbar topbar'
        'map rail'
        'ticker rail';
    }
    .dash-grid :global(aside[aria-label='Teams']) {
      display: none;
    }
  }

  @media (max-width: 767px) {
    .dash-grid {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 3.5rem 40dvh minmax(0, 1fr) 160px;
      grid-template-areas:
        'topbar'
        'map'
        'rail'
        'ticker';
    }
  }

  :global(.is-stale) :global(canvas) {
    opacity: 0.55;
  }
</style>
