<script lang="ts">
  import { onMount } from 'svelte';
  import { DAY_TICKS, type TeamDetailDTO } from '@donjon/shared';
  import { teamColor } from '../design/teams.js';
  import { useSim } from '../store.svelte.js';
  import HeroCard from './HeroCard.svelte';
  import { coin, greedWord, historyGlyph, historyTone, rationsWord, standingWord } from './dossier.js';

  type Status = 'idle' | 'loading' | 'ready' | 'missing' | 'error';

  const REFRESH_MS = 2000;

  const sim = useSim();
  const team = $derived(sim.selectedTeamData);

  let detail = $state<TeamDetailDTO | null>(null);
  let status = $state<Status>('idle');
  let root = $state<HTMLElement | null>(null);

  let controller: AbortController | null = null;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let lastLoadAt = 0;
  let loadedTeam: number | null = null;

  async function load(id: number, soft: boolean): Promise<void> {
    controller?.abort();
    const ac = new AbortController();
    controller = ac;
    lastLoadAt = Date.now();
    if (!soft) status = 'loading';
    try {
      const res = await fetch(`/api/v1/teams/${id}/detail`, { signal: ac.signal });
      if (ac.signal.aborted) return;
      if (res.status === 404) {
        detail = null;
        status = 'missing';
        return;
      }
      if (!res.ok) {
        status = 'error';
        return;
      }
      const data = (await res.json()) as TeamDetailDTO;
      if (ac.signal.aborted) return;
      detail = data;
      loadedTeam = id;
      status = 'ready';
    } catch {
      if (!ac.signal.aborted) status = 'error';
    }
  }

  function schedule(id: number): void {
    if (pending !== null) return;
    const wait = Math.max(0, REFRESH_MS - (Date.now() - lastLoadAt));
    pending = setTimeout(() => {
      pending = null;
      if (sim.selectedTeam === id) void load(id, true);
    }, wait);
  }

  const latestEventId = $derived.by(() => {
    const id = sim.selectedTeam;
    if (id === null) return 0;
    const crew = new Set(team?.heroes.map((h) => h.id) ?? []);
    for (let i = sim.ticker.length - 1; i >= 0; i--) {
      const e = sim.ticker[i]!;
      if (e.teamId === id || (e.heroId !== null && crew.has(e.heroId))) return e.id;
    }
    return 0;
  });

  $effect(() => {
    const id = sim.selectedTeam;
    if (pending !== null) {
      clearTimeout(pending);
      pending = null;
    }
    if (id === null) {
      controller?.abort();
      controller = null;
      detail = null;
      loadedTeam = null;
      status = 'idle';
      return;
    }
    if (loadedTeam !== id) {
      detail = null;
      sim.selectedHero = null;
    }
    void load(id, false);
  });

  $effect(() => {
    void latestEventId;
    const id = sim.selectedTeam;
    if (id === null || loadedTeam !== id) return;
    schedule(id);
  });

  onMount(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = !window.matchMedia('(min-width: 1560px)').matches;
    let held = false;
    const onFocusIn = (e: FocusEvent): void => {
      held = e.target instanceof Node && root !== null && root.contains(e.target);
    };
    document.addEventListener('focusin', onFocusIn);
    if (overlay) root?.focus();
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      controller?.abort();
      controller = null;
      if (pending !== null) clearTimeout(pending);
      pending = null;
      if (overlay && held && previous && previous.isConnected) previous.focus();
    };
  });

  const accent = $derived(teamColor(team?.colorIndex ?? 0));
  const ageTicks = $derived(detail === null ? 0 : Math.max(0, sim.tick - detail.formedTick));
  const age = $derived(
    ageTicks >= DAY_TICKS
      ? `${Math.floor(ageTicks / DAY_TICKS)}d`
      : `${Math.floor(ageTicks / (DAY_TICKS / 24))}h`,
  );
  const standing = $derived(detail?.standing ?? team?.standing ?? 0);
  const carried = $derived(detail?.carriedCp ?? team?.carriedCp ?? 0);
  const banked = $derived(team?.goldCp ?? 0);
  const alive = $derived(team?.heroes.filter((h) => h.alive).length ?? 0);
  const history = $derived(detail === null ? [] : [...detail.history].reverse().slice(0, 40));
  const title = $derived(team?.name ?? detail?.name ?? 'No team selected');
  const gone = $derived(team === null && detail !== null);

  function close(): void {
    sim.drawerOpen = false;
    sim.selectedHero = null;
  }
</script>

<section
  bind:this={root}
  tabindex="-1"
  class="ink flex h-full min-h-0 flex-col bg-dossier text-ink shadow-lift"
  aria-label="Team dossier"
>
  <header class="shrink-0 border-b-2 border-dossier-edge bg-dossier-tab px-3 py-2">
    <div class="flex items-center gap-2">
      <span
        class="ink flex size-8 shrink-0 items-center justify-center rounded-sm font-display text-title leading-none text-ink"
        style="background: {accent}"
        aria-hidden="true">{team?.monogram ?? '??'}</span
      >
      <h2 class="min-w-0 flex-1 truncate font-display text-display-sm leading-none">{title}</h2>
      <button
        type="button"
        class="ink shrink-0 rounded-sm bg-parchment-100 px-2 py-1 font-mono text-micro"
        onclick={close}
      >
        CLOSE
      </button>
    </div>
    <p class="mt-1 truncate text-body-sm text-ink-muted italic">
      {team?.motto ?? detail?.motto ?? 'Pick a team from the roster to open its file.'}
    </p>
    <p class="mt-1 flex items-center gap-2 font-mono text-micro text-stone-600">
      {#if team}
        <span class="text-torch-700">{team.state.toUpperCase()}</span>
        <span aria-hidden="true">·</span>
        <span>F{team.floorId}</span>
        <span aria-hidden="true">·</span>
        <span class="truncate">{team.roomName}</span>
      {:else if gone}
        <span class="text-blood-700">RECORD CLOSED — no longer on the board</span>
      {/if}
    </p>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto p-3">
    {#if sim.selectedTeam === null}
      <p class="text-body-sm text-ink-muted">Nothing is selected.</p>
    {:else if status === 'loading' && detail === null}
      <div class="space-y-2" aria-hidden="true">
        <div class="h-20 rounded-md bg-dossier-sunken"></div>
        <div class="h-12 rounded-md bg-dossier-sunken"></div>
        <div class="h-12 rounded-md bg-dossier-sunken"></div>
        <div class="h-12 rounded-md bg-dossier-sunken"></div>
      </div>
      <p class="sr-only" role="status">Loading the team file.</p>
    {:else if status === 'error' && detail === null}
      <div class="ink rounded-md bg-dossier-sunken p-3">
        <p class="text-body-sm">The clerks could not produce this file.</p>
        <button
          type="button"
          class="ink mt-2 rounded-sm bg-parchment-100 px-2 py-1 font-mono text-micro"
          onclick={() => {
            const id = sim.selectedTeam;
            if (id !== null) void load(id, false);
          }}
        >
          TRY AGAIN
        </button>
      </div>
    {:else if status === 'missing' && detail === null}
      <p class="ink rounded-md bg-dossier-sunken p-3 text-body-sm">
        No file under that number. The party was struck from the register.
      </p>
    {:else if detail}
      <dl class="grid grid-cols-3 gap-1.5">
        <div class="ink-hair rounded-sm bg-dossier-sunken px-2 py-1.5">
          <dt class="font-mono text-micro text-stone-600">STANDING</dt>
          <dd class="font-mono text-stat leading-none" class:text-poison-700={standing > 0} class:text-blood-700={standing < 0}>
            {standing > 0 ? '+' : ''}{standing}
          </dd>
          <dd class="text-micro text-stone-600 italic">{standingWord(standing)}</dd>
        </div>
        <div class="ink-hair rounded-sm bg-dossier-sunken px-2 py-1.5">
          <dt class="font-mono text-micro text-stone-600">RENOWN</dt>
          <dd class="font-mono text-stat leading-none text-torch-700">{team?.renown ?? 0}</dd>
          <dd class="text-micro text-stone-600 italic">{alive} of {team?.heroes.length ?? detail.heroes.length} standing</dd>
        </div>
        <div class="ink-hair rounded-sm bg-dossier-sunken px-2 py-1.5">
          <dt class="font-mono text-micro text-stone-600">DEEPEST</dt>
          <dd class="font-mono text-stat leading-none">F{team?.deepestFloor ?? 0}</dd>
          <dd class="text-micro text-stone-600 italic">
            {team ? `now on F${team.floorId}` : 'no longer delving'}
          </dd>
        </div>
        <div class="ink-hair rounded-sm bg-dossier-sunken px-2 py-1.5">
          <dt class="font-mono text-micro text-stone-600">CARRIED</dt>
          <dd class="font-mono text-num leading-tight">{coin(carried)}</dd>
          <dd class="text-micro text-stone-600 italic">at risk below</dd>
        </div>
        <div class="ink-hair rounded-sm bg-dossier-sunken px-2 py-1.5">
          <dt class="font-mono text-micro text-stone-600">BANKED</dt>
          <dd class="font-mono text-num leading-tight">{coin(banked)}</dd>
          <dd class="text-micro text-stone-600 italic">safe upstairs</dd>
        </div>
        <div class="ink-hair rounded-sm bg-dossier-sunken px-2 py-1.5">
          <dt class="font-mono text-micro text-stone-600">AGE</dt>
          <dd class="font-mono text-num leading-tight">{age}</dd>
          <dd class="text-micro text-stone-600 italic">since articles</dd>
        </div>
        <div class="ink-hair col-span-2 rounded-sm bg-dossier-sunken px-2 py-1.5">
          <dt class="font-mono text-micro text-stone-600">GREED</dt>
          <dd class="font-mono text-num leading-tight">
            {detail.greed.toFixed(2)} <span class="text-micro text-stone-600 italic">{greedWord(detail.greed)}</span>
          </dd>
        </div>
        <div class="ink-hair rounded-sm bg-dossier-sunken px-2 py-1.5">
          <dt class="font-mono text-micro text-stone-600">RATIONS</dt>
          <dd class="font-mono text-num leading-tight">
            {detail.rations} <span class="text-micro text-stone-600 italic">{rationsWord(detail.rations)}</span>
          </dd>
        </div>
      </dl>

      {#if status === 'error'}
        <p class="mt-2 font-mono text-micro text-blood-700" role="status">
          Refresh failed — showing the last filed copy.
        </p>
      {:else if status === 'missing'}
        <p class="mt-2 font-mono text-micro text-blood-700" role="status">
          The register no longer lists this party. Last filed copy shown.
        </p>
      {/if}

      <h3 class="mt-3 border-b-2 border-dossier-edge pb-1 font-display text-title">ROSTER</h3>
      <ul class="mt-2 space-y-1.5">
        {#each detail.heroes as hero (hero.id)}
          <HeroCard {hero} {accent} />
        {:else}
          <li class="text-body-sm text-stone-600 italic">Nobody is left on the books.</li>
        {/each}
      </ul>

      <h3 class="mt-4 border-b-2 border-dossier-edge pb-1 font-display text-title">FILE HISTORY</h3>
      <ol class="mt-2 space-y-1">
        {#each history as entry, i (entry.t + ':' + i)}
          <li class="flex gap-2 border-l-2 border-dossier-rule pl-2">
            <span aria-hidden="true" class="shrink-0 font-mono text-micro {historyTone(entry.k)}">
              {historyGlyph(entry.k)}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-body-sm text-ink-800">{entry.s}</span>
              <span class="font-mono text-micro text-stone-600">
                day {Math.floor(entry.t / DAY_TICKS)} · t{entry.t}
              </span>
            </span>
          </li>
        {:else}
          <li class="text-body-sm text-stone-600 italic">The file is empty.</li>
        {/each}
      </ol>
    {/if}
  </div>
</section>
