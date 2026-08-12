<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import ConnectionBanner from '$lib/components/ConnectionBanner.svelte';
  import EventTicker from '$lib/components/EventTicker.svelte';
  import KeeperPanel from '$lib/components/KeeperPanel.svelte';
  import Leaderboard from '$lib/components/Leaderboard.svelte';
  import MapPanel from '$lib/components/MapPanel.svelte';
  import Memorial from '$lib/components/Memorial.svelte';
  import SpeedControl from '$lib/components/SpeedControl.svelte';
  import StatCard from '$lib/components/StatCard.svelte';
  import TeamCard from '$lib/components/TeamCard.svelte';
  import TeamDrawer from '$lib/components/TeamDrawer.svelte';
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
  let rosterEl = $state<HTMLElement | null>(null);

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
      return;
    }
    if (!auto) sim.drawerOpen = true;
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
    rosterEl?.scrollIntoView({ block: 'nearest' });
    rosterEl?.focus();
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
    else if (e.key === 'Escape') {
      if (sim.drawerOpen) closeDrawer();
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
    class="ink flex h-14 items-center gap-4 overflow-x-auto bg-stone-900 px-3 shadow-ink"
    style="grid-area: topbar"
  >
    <div class="shrink-0 pr-1">
      <h1 class="font-display text-display-sm leading-none text-torch-300">DONJON</h1>
      <p class="font-mono text-micro leading-none text-stone-400">KEEPER'S BOARD</p>
    </div>
    <span class="h-9 w-0.5 shrink-0 bg-ink-900"></span>
    <StatCard label="FALLEN" value={sim.casualties} tone="danger" />
    <StatCard label="HEROES" value={sim.heroesLiving} hint="{sim.tavernSize} in the tavern" />
    <StatCard label="TEAMS" value="{sim.teams.length}/10" />
    <StatCard label="TREASURY" value={(sim.keeper?.treasuryCp ?? 0).toLocaleString()} tone="gold" />
    <StatCard label="DAY" value={sim.day} hint={sim.watch.toLowerCase()} />
    <StatCard label="DEEPEST" value="F{deepest}" />
    <div class="ml-auto flex shrink-0 items-center gap-3">
      <p class="keys font-mono text-micro text-stone-400">
        <span class:text-torch-300={sim.follow}>F FOLLOW</span>
        <span class="text-stone-600">·</span>
        <span class:text-torch-300={sim.director}>D DIRECTOR</span>
        <span class="text-stone-600">·</span>
        <span>[ ] FLOOR</span>
      </p>
      <SpeedControl />
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
        TEAMS
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
        RANKINGS
      </button>
    </div>

    <aside
      id="roster"
      bind:this={rosterEl}
      tabindex="-1"
      class="ink flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-stone-900 p-2"
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

    <aside
      class="rail ink flex min-h-0 flex-1 flex-col bg-stone-900"
      style="grid-area: rail"
      aria-label="Rankings and dungeon status"
    >
      <div class="min-h-0 flex-1 overflow-hidden"><Leaderboard /></div>
      <KeeperPanel />
      <div class="min-h-0 flex-1 overflow-hidden"><Memorial /></div>
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
</div>

<style>
  .dash-grid {
    display: grid;
    height: 100dvh;
    gap: 0.75rem;
    padding: 0.75rem;
    grid-template-columns: 21rem minmax(480px, 1fr) 21.25rem;
    grid-template-rows: 3.5rem minmax(0, 1fr) 200px;
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

  @media (min-width: 1600px) {
    .dash-grid.has-dossier {
      grid-template-columns: 21rem minmax(360px, 1fr) 21.25rem 24rem;
      grid-template-areas:
        'topbar topbar topbar topbar'
        'roster map rail dossier'
        'roster ticker rail dossier';
    }

    .dash-grid.has-dossier .dossier {
      position: static;
      width: auto;
      padding: 0;
    }

    .scrim {
      display: none;
    }
  }

  @media (max-width: 1279px) {
    .dash-grid {
      grid-template-columns: minmax(0, 1fr) 21rem;
      grid-template-rows: 3.5rem minmax(0, 1fr) 180px;
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

  @media (min-width: 1600px) {
    .keys {
      display: block;
      white-space: nowrap;
    }
  }

  :global(.is-stale) :global(canvas) {
    opacity: 0.55;
  }
</style>
