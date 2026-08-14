<script lang="ts">
  import { DAY_TICKS, type EventDTO } from '@donjon/shared';
  import { teamColor } from '../design/teams.js';
  import { useSim } from '../store.svelte.js';

  const sim = useSim();

  const FILTERS = ['all', 'combat', 'loot', 'deaths', 'story', 'keeper'] as const;
  type Filter = (typeof FILTERS)[number];

  const WINDOW = 90;
  const CHAPTER_ROWS = 7;
  const CHAPTER_ROWS_LEAD = 16;
  const MAX_BLOCKS = 24;

  let filter = $state<Filter>('all');
  let paused = $state(false);
  let frozen = $state<EventDTO[]>([]);

  const baseline = sim.maxEventId;

  const COMBAT = new Set(['COMBAT_START', 'COMBAT_ROUND', 'COMBAT_END', 'MONSTER_DOWN', 'ROOM_CLEARED']);
  const LOOT = new Set(['LOOT_FOUND', 'TOLL_PAID', 'TRAP_DISARMED']);
  const DEATHS = new Set(['HERO_DOWN', 'HERO_DEATH', 'TEAM_WIPE', 'TRAP_SPRUNG', 'TEAM_DISBANDED']);
  const KEEPER = new Set([
    'KEEPER_DECREE',
    'KHAN_LOAN',
    'CORPSE_TAX_LEVIED',
    'WAGE_PAID',
    'ENTRY_FEE_PAID',
    'DUNGEON_RESTOCK',
    'GUARDIAN_HIRED',
    'KEEPER_SCHEME_SET',
    'KEEPER_SCHEME_ENDED',
    'DUNGEON_DORMANCY',
    'KEEPER_RUNG_CHANGED',
    'KHAN_OVERSEER',
    'KEEPER_GAMBIT',
    'TEAM_ESTATE_SEIZED',
    'APEX_SUMMONED',
  ]);
  const STORY = new Set([
    'HERO_BOND_FORMED',
    'HERO_GRUDGE_FORMED',
    'HERO_NEMESIS_SET',
    'HERO_NEMESIS_SLAIN',
    'HERO_EPITHET_GAINED',
    'HERO_RETIRED',
    'HERO_LEVEL_UP',
    'RECORD_SET',
    'ROOM_LANDMARK',
    'TEAM_FORMED',
    'RECRUIT',
    'TRIUMPH',
  ]);

  const MOMENT_LABEL: Record<string, string> = {
    HERO_DEATH: 'A DEATH',
    TEAM_WIPE: 'A PARTY LOST',
    KEEPER_DECREE: 'DECREE',
    KHAN_LOAN: 'DEBT',
    RECORD_SET: 'NEW RECORD',
    HERO_NEMESIS_SLAIN: 'VENGEANCE',
    KEEPER_SCHEME_SET: 'A SCHEME BEGINS',
    KEEPER_SCHEME_ENDED: 'A SCHEME ENDS',
    WORLD_INIT: 'THE DUNGEON OPENS',
    TEAM_FORMED: 'A PARTY FORMS',
    DUNGEON_DORMANCY: 'THE DUNGEON SLEEPS',
    KEEPER_RUNG_CHANGED: "THE KHAN'S FAVOR",
    KHAN_OVERSEER: 'AN OVERSEER',
    KEEPER_GAMBIT: 'A GAMBIT',
    TRIUMPH: 'A TRIUMPH',
    APEX_SUMMONED: 'THE VAULT STIRS',
  };

  const GLYPHS: Record<string, string> = {
    HERO_DEATH: '☠',
    TEAM_WIPE: '☠',
    HERO_DOWN: '✚',
    TRAP_SPRUNG: '✚',
    TEAM_DISBANDED: '✚',
    LOOT_FOUND: '◈',
    TOLL_PAID: '◈',
    TRAP_DISARMED: '◈',
    FLOOR_DESCEND: '↓',
    FLOOR_ASCEND: '↑',
    PARTY_ENTERED: '»',
    PARTY_EXITED: '«',
    REST: '~',
    EXPLORED: '·',
    RECORD_SET: '★',
    HERO_EPITHET_GAINED: '✧',
    HERO_BOND_FORMED: '∞',
    HERO_GRUDGE_FORMED: '⚡',
    HERO_NEMESIS_SET: '⊙',
    HERO_NEMESIS_SLAIN: '⊗',
    ROOM_LANDMARK: '⌂',
    HERO_LEVEL_UP: '▲',
    HERO_RETIRED: '❧',
    RECRUIT: '✦',
    TEAM_FORMED: '✤',
    TRIUMPH: '♛',
    APEX_SUMMONED: '♜',
  };

  function tone(type: string): string {
    if (DEATHS.has(type)) return 'text-blood-300';
    if (LOOT.has(type)) return 'text-rank-gold';
    if (KEEPER.has(type)) return 'text-arcane-300';
    if (STORY.has(type)) return 'text-parchment-300';
    if (COMBAT.has(type)) return 'text-torch-200';
    return 'text-parchment-200';
  }

  function glyph(type: string): string {
    if (GLYPHS[type]) return GLYPHS[type];
    if (KEEPER.has(type)) return '§';
    if (COMBAT.has(type)) return '⚔';
    return '·';
  }

  function rowClass(e: EventDTO): string {
    if (e.severity === 0) return 'text-micro text-stone-500';
    if (e.severity >= 2) return `text-body-sm font-semibold ${tone(e.type)}`;
    return `text-table ${tone(e.type)}`;
  }

  function dayOfTick(t: number): number {
    return Math.floor(t / DAY_TICKS);
  }

  const remembered = new Map<number, { name: string; colorIndex: number }>();

  const teamById = $derived.by(() => {
    const map = new Map(sim.teams.map((t) => [t.id, t]));
    for (const t of sim.teams) remembered.set(t.id, { name: t.name, colorIndex: t.colorIndex });
    while (remembered.size > 120) {
      const oldest = remembered.keys().next().value;
      if (oldest === undefined) break;
      remembered.delete(oldest);
    }
    return map;
  });

  function teamName(teamId: number | null): string {
    if (teamId === null) return '';
    return teamById.get(teamId)?.name ?? remembered.get(teamId)?.name ?? '';
  }

  function accent(teamId: number | null, fallback: string): string {
    if (teamId === null) return fallback;
    const known = teamById.get(teamId) ?? remembered.get(teamId);
    return known ? teamColor(known.colorIndex) : fallback;
  }

  function live(teamId: number | null): boolean {
    return teamId !== null && teamById.has(teamId);
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
      if (filter === 'story') return STORY.has(e.type);
      return KEEPER.has(e.type);
    }),
  );

  interface Chapter {
    kind: 'chapter';
    key: number;
    teamId: number | null;
    rows: EventDTO[];
    hidden: number;
    from: number;
    to: number;
    kills: number;
    downs: number;
    loot: number;
  }

  interface Moment {
    kind: 'moment';
    key: number;
    e: EventDTO;
  }

  type Block = Chapter | Moment;

  const blocks = $derived.by<Block[]>(() => {
    const source = paused ? frozen : matching;
    const out: Block[] = [];
    let current: Chapter | null = null;

    for (const e of source.slice(-WINDOW)) {
      if (e.severity === 3) {
        current = null;
        out.push({ kind: 'moment', key: e.id, e });
        continue;
      }
      if (!current || current.teamId !== e.teamId) {
        current = {
          kind: 'chapter',
          key: e.id,
          teamId: e.teamId,
          rows: [],
          hidden: 0,
          from: e.tick,
          to: e.tick,
          kills: 0,
          downs: 0,
          loot: 0,
        };
        out.push(current);
      }
      current.rows.push(e);
      current.to = e.tick;
      if (e.type === 'MONSTER_DOWN') current.kills += 1;
      if (e.type === 'HERO_DOWN' || e.type === 'HERO_DEATH') current.downs += 1;
      if (e.type === 'LOOT_FOUND') current.loot += 1;
    }

    for (let i = 0; i < out.length; i++) {
      const block = out[i];
      if (!block || block.kind !== 'chapter') continue;
      const cap = i === out.length - 1 ? CHAPTER_ROWS_LEAD : CHAPTER_ROWS;
      if (block.rows.length > cap) {
        block.hidden = block.rows.length - cap;
        block.rows = block.rows.slice(-cap);
      }
    }

    out.reverse();
    return out.slice(0, MAX_BLOCKS);
  });

  const digest = $derived(
    sim.ticker
      .filter((e) => e.severity >= 2)
      .slice(-3)
      .map((e) => e.text)
      .join('. '),
  );

  function togglePause(): void {
    if (!paused) frozen = matching.slice(-WINDOW);
    paused = !paused;
  }

  function setFilter(f: Filter): void {
    filter = f;
    if (paused) frozen = matching.slice(-WINDOW);
  }

  function select(teamId: number | null): void {
    if (teamId === null) return;
    sim.selectedTeam = teamId;
    const team = teamById.get(teamId);
    if (team) sim.selectedFloor = team.floorId;
  }
</script>

<section class="ink flex min-h-0 flex-col bg-stone-900" aria-label="Event feed">
  <header class="flex shrink-0 flex-wrap items-center gap-1 border-b-2 border-ink-900 px-2 py-1">
    <h2 class="shrink-0 pr-1 font-display text-display-sm leading-none text-parchment-100">
      THE FEED
    </h2>
    {#if sim.selectedTeam !== null}
      <button
        type="button"
        onclick={() => (sim.selectedTeam = null)}
        class="mr-1 flex shrink-0 items-center gap-1 rounded-full border border-torch-400 px-2 py-0.5 font-mono text-micro text-torch-300"
        title="Show all teams again"
      >
        <span
          class="size-2 rounded-full border border-ink-900"
          style="background: {accent(sim.selectedTeam, 'var(--color-torch-400)')}"
        ></span>
        {teamName(sim.selectedTeam) || 'team'} ✕
      </button>
    {/if}
    {#each FILTERS as f (f)}
      <button
        type="button"
        onclick={() => setFilter(f)}
        aria-pressed={filter === f}
        class="shrink-0 rounded-full border border-transparent px-2 py-0.5 font-mono text-micro uppercase transition-colors hover:text-parchment-200"
        class:border-torch-400={filter === f}
        class:bg-sev-2-wash={filter === f}
        class:text-torch-300={filter === f}
        class:text-stone-500={filter !== f}
      >
        {f}
      </button>
    {/each}
    <button
      type="button"
      onclick={togglePause}
      class="ml-auto shrink-0 rounded-full border border-transparent bg-stone-900 px-2 py-0.5 font-mono text-micro hover:text-parchment-200"
      class:border-torch-400={paused}
      class:text-torch-300={paused}
      class:text-stone-500={!paused}
      aria-pressed={paused}
    >
      {paused ? '▶ RESUME' : '⏸ PAUSE'}
    </button>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto" role="log" aria-live="off">
    {#each blocks as block, i (block.key)}
      {#if block.kind === 'moment'}
        {@const hue = accent(block.e.teamId, 'var(--color-torch-400)')}
        <article
          class="m-1.5 overflow-hidden rounded-sm border-2 border-ink-900 bg-stone-800 shadow-ink-sm"
          class:animate-flare={i === 0 && block.e.id > baseline}
        >
          {#if live(block.e.teamId)}
            <button
              type="button"
              onclick={() => select(block.e.teamId)}
              class="block w-full border-l-4 px-2.5 py-1.5 text-left"
              class:bg-sev-3-wash={DEATHS.has(block.e.type)}
              style="border-left-color: {hue}"
            >
              {@render moment(block.e, teamName(block.e.teamId), hue)}
            </button>
          {:else}
            <div
              class="border-l-4 px-2.5 py-1.5"
              class:bg-sev-3-wash={DEATHS.has(block.e.type)}
              style="border-left-color: {hue}"
            >
              {@render moment(block.e, teamName(block.e.teamId), hue)}
            </div>
          {/if}
        </article>
      {:else}
        {@const team = block.teamId === null ? undefined : teamById.get(block.teamId)}
        {@const hue = accent(block.teamId, 'var(--color-stone-500)')}
        <section class="border-b border-ink-900/70 last:border-0">
          <h3
            class="sticky top-0 z-10 flex items-center gap-2 border-l-4 bg-stone-800 px-2 py-0.5"
            style="border-left-color: {hue}"
          >
            {#if block.teamId === null}
              <span class="shrink-0 font-mono text-micro text-stone-400">THE DUNGEON</span>
            {:else if live(block.teamId)}
              <button
                type="button"
                onclick={() => select(block.teamId)}
                class="truncate font-mono text-micro text-parchment-200 hover:text-torch-300"
              >
                {teamName(block.teamId)}
              </button>
            {:else}
              <span class="truncate font-mono text-micro text-stone-400 line-through">
                {teamName(block.teamId) || 'a vanished company'}
              </span>
            {/if}
            {#if i === 0 && team}
              <span class="shrink-0 font-mono text-micro text-stone-500">
                F{team.floorId} · {team.roomName}
              </span>
            {:else}
              <span class="shrink-0 font-mono text-micro text-stone-600">DAY {dayOfTick(block.to)}</span>
            {/if}
            <span class="ml-auto shrink-0 space-x-1.5 font-mono text-micro tabular">
              {#if block.kills > 0}<span class="text-torch-200">⚔{block.kills}</span>{/if}
              {#if block.loot > 0}<span class="text-rank-gold">◈{block.loot}</span>{/if}
              {#if block.downs > 0}<span class="text-blood-300">†{block.downs}</span>{/if}
            </span>
          </h3>
          <ol class="px-2 py-0.5">
            {#if block.hidden > 0}
              <li class="pl-5 font-mono text-micro text-stone-600">+{block.hidden} earlier</li>
            {/if}
            {#each block.rows as event (event.id)}
              <li class:animate-flare={i === 0 && event.id > baseline}>
                {#if live(event.teamId)}
                  <button
                    type="button"
                    onclick={() => select(event.teamId)}
                    class="flex w-full items-baseline gap-1.5 rounded-xs px-1 py-px text-left hover:bg-parchment-100/5"
                  >
                    {@render beat(event)}
                  </button>
                {:else}
                  <div class="flex items-baseline gap-1.5 px-1 py-px">{@render beat(event)}</div>
                {/if}
              </li>
            {/each}
          </ol>
        </section>
      {/if}
    {:else}
      <p class="px-2 py-6 text-center text-body-sm text-stone-500">Nothing yet.</p>
    {/each}
  </div>

  <p class="sr-only" aria-live="polite" aria-atomic="true">{digest}</p>
</section>

{#snippet moment(e: EventDTO, teamName: string, accent: string)}
  <p class="flex items-baseline gap-2 font-mono text-micro">
    <span class="shrink-0 text-torch-300">{MOMENT_LABEL[e.type] ?? 'A MOMENT'}</span>
    {#if teamName}
      <span class="truncate" style="color: {accent}">{teamName}</span>
    {/if}
    <span class="ml-auto shrink-0 text-stone-500">DAY {dayOfTick(e.tick)}</span>
  </p>
  <p class="font-display text-title leading-tight text-parchment-100">{e.text}</p>
{/snippet}

{#snippet beat(e: EventDTO)}
  <span aria-hidden="true" class="w-3 shrink-0 font-mono text-micro {tone(e.type)}">{glyph(e.type)}</span>
  <span class="min-w-0 flex-1 {rowClass(e)}">{e.text}</span>
{/snippet}
