<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import Codex from '$lib/components/Codex.svelte';
  import ConnectionBanner from '$lib/components/ConnectionBanner.svelte';
  import EventTicker from '$lib/components/EventTicker.svelte';
  import KeeperPanel from '$lib/components/KeeperPanel.svelte';
  import MapPanel from '$lib/components/MapPanel.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import TeamDrawer from '$lib/components/TeamDrawer.svelte';
  import TeamRoster from '$lib/components/TeamRoster.svelte';
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

  let sideTab = $state<'teams' | 'board'>('teams');
  let codexOpen = $state(false);

  onMount(() => {
    const connection = connect(sim, motion);
    return () => connection.close();
  });

  const deepest = $derived(Math.max(1, ...sim.floors.map((f) => f.depth)));
  const cameraStatus = $derived(
    `Director ${sim.director ? 'on' : 'off'}. Follow ${sim.follow ? 'on' : 'off'}.`,
  );

  $effect(() => {
    const id = sim.selectedTeam;
    const auto = untrack(() => sim.autoSelect);
    untrack(() => (sim.autoSelect = false));
    if (id === null) {
      sim.drawerOpen = false;
      sim.selectedHero = null;
      sim.follow = false;
      return;
    }
    if (!auto) {
      sim.drawerOpen = true;
      sim.follow = true;
    }
  });

  function closeDrawer(): void {
    sim.drawerOpen = false;
    sim.selectedHero = null;
    if (sim.selectedTeam !== null && !sim.teams.some((t) => t.id === sim.selectedTeam)) {
      sim.selectedTeam = null;
    }
  }

  async function jumpToRoster(e: MouseEvent): Promise<void> {
    e.preventDefault();
    sideTab = 'teams';
    await tick();
    const el = document.getElementById('roster');
    el?.scrollIntoView({ block: 'nearest' });
    el?.focus();
  }

  function onKeydown(e: KeyboardEvent): void {
    const el = e.target;
    const typing =
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLElement && el.isContentEditable);
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    if (e.key === '[') sim.selectedFloor = Math.max(1, sim.selectedFloor - 1);
    else if (e.key === ']') sim.selectedFloor = Math.min(sim.floors.length, sim.selectedFloor + 1);
    else if (e.key === 'f' || e.key === 'F') sim.follow = !sim.follow;
    else if (e.key === 'd' || e.key === 'D') sim.director = !sim.director;
    else if (e.key === 'c' || e.key === 'C') codexOpen = !codexOpen;
    else if (e.key === 'Escape') {
      if (codexOpen) codexOpen = false;
      else if (sim.drawerOpen) closeDrawer();
      else sim.selectedTeam = null;
    }
  }
</script>

<svelte:head><title>Donjon Sim — live</title></svelte:head>

<svelte:window onkeydown={onKeydown} />

<a
  href="/text"
  class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[60] focus:rounded focus:bg-panel focus:px-3 focus:py-2 focus:text-ink"
>
  View this dungeon as a text page
</a>
<a
  href="#roster"
  onclick={jumpToRoster}
  class="sr-only focus:not-sr-only focus:absolute focus:left-56 focus:top-2 focus:z-[60] focus:rounded focus:bg-panel focus:px-3 focus:py-2 focus:text-ink"
>
  Skip to teams
</a>

<p class="sr-only" role="status" aria-live="assertive">
  {sim.connection === 'stale' || sim.connection === 'offline'
    ? 'Connection to the simulation lost. The board is frozen.'
    : ''}
</p>

<p class="sr-only" role="status" aria-live="polite">{cameraStatus}</p>

<p class="sr-only">
  Keyboard shortcuts: left bracket and right bracket change floor, F follows the selected team, D
  toggles director cut, Escape closes the dossier and then clears the selection.
</p>

<div class="dash-grid" class:is-stale={sim.isStale} class:has-dossier={sim.drawerOpen} data-tab={sideTab}>
  <header
    class="ink flex h-14 items-center gap-4 overflow-x-auto overflow-y-hidden bg-stone-900 px-3 shadow-ink"
    style="grid-area: topbar"
  >
    <div class="shrink-0 pr-1">
      <h1 class="font-display text-display-sm leading-none text-torch-300">DONJON</h1>
      <p class="font-mono text-micro leading-none text-stone-500">KEEPER'S BOARD</p>
    </div>
    <span class="h-9 w-0.5 shrink-0 bg-ink-900"></span>
    <StatCard label="FALLEN" value={sim.casualties} tone="danger" />
    <StatCard label="TREASURY" value={(sim.keeper?.treasuryCp ?? 0).toLocaleString()} tone="gold" />
    <div class="hidden shrink-0 flex-col gap-1 font-mono text-micro text-stone-500 lg:flex">
      <p>
        DAY <span class="text-parchment-200">{sim.day}</span>
        <span class="text-stone-600">·</span>
        {sim.watch.toLowerCase()}
      </p>
      <p>
        {sim.heroesLiving} afield <span class="text-stone-600">·</span>
        {sim.tavernSize} in the tavern <span class="text-stone-600">·</span>
        {sim.teams.length}/10 companies <span class="text-stone-600">·</span> deepest F{deepest}
      </p>
    </div>
    <div class="ml-auto flex shrink-0 items-center gap-3">
      <p class="keys font-mono text-micro text-stone-600">
        <span class:text-torch-300={sim.follow}>F FOLLOW</span>
        <span class="text-stone-700">·</span>
        <span class:text-torch-300={sim.director}>D DIRECTOR</span>
        <span class="text-stone-700">·</span>
        <span>[ ] FLOOR</span>
      </p>
      <button
        type="button"
        class="ink shrink-0 rounded-sm px-2 py-1 font-mono text-micro {codexOpen
          ? 'bg-tab-active text-ink'
          : 'bg-tab-idle text-stone-300'}"
        aria-pressed={codexOpen}
        onclick={() => (codexOpen = !codexOpen)}
      >
        CODEX
      </button>
      <ConnectionBanner />
    </div>
  </header>

  <div class="side-stack">
    <div class="tabs flex shrink-0 gap-1" role="group" aria-label="Side panel">
      <button
        type="button"
        class="ink flex-1 rounded-t-sm px-3 py-1.5 font-display text-title leading-none"
        class:bg-tab-active={sideTab === 'teams'}
        class:text-ink={sideTab === 'teams'}
        class:bg-tab-idle={sideTab !== 'teams'}
        class:text-stone-300={sideTab !== 'teams'}
        aria-pressed={sideTab === 'teams'}
        onclick={() => (sideTab = 'teams')}
      >
        THE FIELD
      </button>
      <button
        type="button"
        class="ink flex-1 rounded-t-sm px-3 py-1.5 font-display text-title leading-none"
        class:bg-tab-active={sideTab === 'board'}
        class:text-ink={sideTab === 'board'}
        class:bg-tab-idle={sideTab !== 'board'}
        class:text-stone-300={sideTab !== 'board'}
        aria-pressed={sideTab === 'board'}
        onclick={() => (sideTab = 'board')}
      >
        THE KEEPER
      </button>
    </div>

    <aside
      id="roster"
      tabindex="-1"
      class="ink flex min-h-0 flex-1 flex-col overflow-hidden bg-stone-900/80"
      style="grid-area: roster"
    >
      <TeamRoster />
    </aside>

    <aside
      class="rail ink flex min-h-0 flex-1 flex-col overflow-hidden bg-stone-900/80"
      style="grid-area: rail"
    >
      <KeeperPanel />
    </aside>
  </div>

  <div class="ink flex min-h-0 flex-col bg-stone-950" style="grid-area: map">
    <MapPanel />
  </div>

  <div style="grid-area: ticker" class="min-h-0">
    <EventTicker />
  </div>

  {#if sim.drawerOpen}
    <button type="button" class="scrim" onclick={closeDrawer}>
      <span class="sr-only">Close the dossier</span>
    </button>
    <div class="dossier min-h-0" style="grid-area: dossier">
      <TeamDrawer />
    </div>
  {/if}

  {#if codexOpen}
    <button type="button" class="scrim codex-scrim" onclick={() => (codexOpen = false)}>
      <span class="sr-only">Close the codex</span>
    </button>
    <div class="codex min-h-0">
      <Codex onclose={() => (codexOpen = false)} />
    </div>
  {/if}
</div>

<style>
  .dash-grid {
    display: grid;
    height: 100dvh;
    overflow: hidden;
    gap: 0.75rem;
    padding: 0.75rem;
    grid-template-columns: 20rem minmax(460px, 1fr) 19rem;
    grid-template-rows: 3.5rem minmax(0, 1fr) 15rem;
    grid-template-areas:
      'topbar topbar topbar'
      'roster map rail'
      'roster ticker rail';
  }

  .side-stack {
    display: contents;
  }

  .tabs {
    display: none;
  }

  .dossier {
    position: fixed;
    inset: 0 0 0 auto;
    z-index: 50;
    width: min(26rem, 100vw);
    padding: 0.75rem;
    animation: var(--animate-dossier-in);
  }

  .scrim {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: var(--color-scrim);
    cursor: default;
  }

  .codex {
    position: fixed;
    inset: 0 0 0 auto;
    z-index: 55;
    width: min(28rem, 100vw);
    padding: 0.75rem;
    animation: var(--animate-dossier-in);
  }

  .codex-scrim {
    z-index: 54;
    display: block;
  }

  @media (min-width: 1560px) {
    .dash-grid.has-dossier {
      grid-template-columns: 20rem minmax(400px, 1fr) 19rem 23rem;
      grid-template-areas:
        'topbar topbar topbar topbar'
        'roster map rail dossier'
        'roster ticker rail dossier';
    }

    .dash-grid.has-dossier .dossier {
      position: static;
      width: auto;
      min-height: 0;
      overflow: hidden;
      padding: 0;
      animation: none;
    }

    .scrim:not(.codex-scrim) {
      display: none;
    }
  }

  @media (max-width: 1279px) {
    .dash-grid {
      grid-template-columns: minmax(0, 1fr) 20rem;
      grid-template-rows: 3.5rem minmax(0, 1fr) 13rem;
      grid-template-areas:
        'topbar topbar'
        'map side'
        'ticker side';
    }

    .side-stack {
      display: flex;
      min-height: 0;
      flex-direction: column;
      gap: 0.5rem;
      grid-area: side;
    }

    .tabs {
      display: flex;
    }

    .dash-grid[data-tab='board'] #roster {
      display: none;
    }

    .dash-grid[data-tab='teams'] .rail {
      display: none;
    }

    .side-stack :global(section > header > h2) {
      display: none;
    }
  }

  @media (max-width: 767px) {
    .dash-grid {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 3.5rem 38dvh minmax(0, 1fr) 150px;
      grid-template-areas:
        'topbar'
        'map'
        'side'
        'ticker';
    }
  }

  .keys {
    display: none;
  }

  @media (min-width: 1560px) {
    .keys {
      display: block;
      white-space: nowrap;
    }
  }

  :global(.is-stale) :global(canvas) {
    opacity: 0.55;
  }
</style>
