<script lang="ts">
  import { DAY_TICKS } from '@donjon/shared';
  import { useSim } from '../store.svelte.js';

  const sim = useSim();

  const RECORD_ORDER = ['deepest', 'haul', 'kills', 'survivor', 'toll'];

  const RECORD_NAME: Record<string, string> = {
    deepest: 'DEPTH',
    haul: 'HAUL',
    kills: 'KILLS',
    survivor: 'OLDEST',
    toll: 'TOLL',
  };

  const moodTone = $derived(
    sim.keeper?.mood === 'bankrupt'
      ? 'text-blood-300'
      : sim.keeper?.mood === 'panicked'
        ? 'text-torch-300'
        : sim.keeper?.mood === 'greedy'
          ? 'text-rank-gold'
          : 'text-poison-300',
  );

  const treasuryPct = $derived(Math.min(100, Math.round(((sim.keeper?.treasuryCp ?? 0) / 150_000) * 100)));
  const loanPct = $derived(Math.min(100, Math.round(((sim.keeper?.loanCp ?? 0) / 25_000) * 100)));

  const scheme = $derived(sim.keeper?.scheme ?? null);

  let anchorId = $state<number | null>(null);
  let anchorProgress = $state(0);

  $effect(() => {
    const s = sim.keeper?.scheme ?? null;
    if (!s) {
      anchorId = null;
      return;
    }
    if (anchorId !== s.id) {
      anchorId = s.id;
      anchorProgress = s.progress;
    }
  });

  const schemeAim = $derived.by(() => {
    if (!scheme) return '';
    if (scheme.kind === 'bankrupt') {
      return `Bleed their purse below ${scheme.goal.toLocaleString()}cp before the deadline.`;
    }
    if (scheme.kind === 'blood_quota') {
      const left = scheme.goal - scheme.progress;
      return left > 0
        ? `Fill the quota — ${left} more ${left === 1 ? 'hero' : 'heroes'} must die in the dungeon.`
        : 'The quota is filled. The Keeper is only waiting to collect.';
    }
    if (scheme.kind === 'stop_descent') return `Bar them from floor ${scheme.goal}. They stand at ${scheme.progress}.`;
    return `Wring ${scheme.goal.toLocaleString()}cp of toll out of them.`;
  });

  const schemeTally = $derived.by(() => {
    if (!scheme) return '';
    if (scheme.kind === 'bankrupt') return `${scheme.progress.toLocaleString()}cp still in their purse`;
    if (scheme.kind === 'blood_quota') return `${scheme.progress} slain of ${scheme.goal} demanded`;
    if (scheme.kind === 'stop_descent') return `the ward holds — floor ${scheme.progress} of ${scheme.goal}`;
    return `${scheme.progress.toLocaleString()} of ${scheme.goal.toLocaleString()}cp taken`;
  });

  const schemePct = $derived.by(() => {
    if (!scheme) return 0;
    if (scheme.kind === 'stop_descent') {
      const span = scheme.deadlineTick - scheme.startedTick;
      if (span <= 0) return 100;
      return Math.max(0, Math.min(100, Math.round(((sim.tick - scheme.startedTick) / span) * 100)));
    }
    if (scheme.kind === 'toll_harvest') {
      return Math.max(0, Math.min(100, Math.round((scheme.progress / Math.max(1, scheme.goal)) * 100)));
    }
    const base = anchorId === scheme.id ? anchorProgress : scheme.progress;
    const span = scheme.goal - base;
    if (span === 0) return 100;
    return Math.max(0, Math.min(100, Math.round(((scheme.progress - base) / span) * 100)));
  });

  const daysTone = $derived(
    !scheme ? '' : scheme.daysLeft <= 1 ? 'text-blood-300' : scheme.daysLeft <= 3 ? 'text-torch-300' : 'text-stone-300',
  );

  const actAge = $derived.by(() => {
    const act = sim.keeper;
    if (!act || !act.lastAct) return '';
    const elapsed = Math.max(0, sim.tick - act.lastActTick);
    if (elapsed < 60) return 'just now';
    const hours = Math.floor((elapsed / DAY_TICKS) * 24);
    if (hours < 1) return `${Math.floor(elapsed / 60)}m ago`;
    return `${hours}h ago`;
  });

  const records = $derived(
    [...(sim.keeper?.records ?? [])].sort(
      (a, b) => RECORD_ORDER.indexOf(a.kind) - RECORD_ORDER.indexOf(b.kind),
    ),
  );

  function recordValue(kind: string, value: number): string {
    if (kind === 'deepest') return `F${value}`;
    if (kind === 'haul' || kind === 'toll') return `${value.toLocaleString()}cp`;
    if (kind === 'survivor') return `${(value / DAY_TICKS).toFixed(1)}d`;
    return String(value);
  }

  function selectTeam(teamId: number): void {
    sim.selectedTeam = teamId;
    const team = sim.teams.find((t) => t.id === teamId);
    if (team) sim.selectedFloor = team.floorId;
  }
</script>

<section
  class="flex max-h-[50%] shrink-0 flex-col overflow-y-auto border-t-2 border-ink-900"
  aria-label="Dungeon status"
>
  <h2 class="sticky top-0 z-10 border-b-2 border-ink-900 bg-stone-900 px-3 py-1.5 text-label text-parchment-300">
    THE KEEPER
  </h2>

  {#if sim.keeper}
    {#if scheme}
      <article class="m-2 rounded-sm border-2 border-blood-500 bg-sev-3-wash shadow-ink-sm">
        <header class="flex items-center gap-1.5 border-b-2 border-blood-500/60 px-2 py-1">
          <span class="size-2 shrink-0 rounded-full bg-blood-400 animate-ember"></span>
          <span class="font-mono text-micro text-blood-300">SCHEME IN MOTION</span>
          <span class="ml-auto shrink-0 font-mono text-micro {daysTone}">
            {scheme.daysLeft}d LEFT
          </span>
        </header>

        <div class="space-y-1.5 px-2 py-1.5">
          <h3 class="font-display text-title leading-tight text-parchment-100">“{scheme.name}”</h3>
          <p class="text-body-sm text-stone-200">{schemeAim}</p>

          <p class="flex items-baseline gap-1.5">
            <span class="font-mono text-micro text-stone-400">MARKED</span>
            {#if sim.teams.some((t) => t.id === scheme.teamId)}
              <button
                type="button"
                onclick={() => selectTeam(scheme.teamId)}
                class="truncate rounded-xs border border-blood-400 px-1.5 py-0.5 font-mono text-micro text-blood-300 hover:bg-blood-400/15"
              >
                {scheme.teamName} ›
              </button>
            {:else}
              <span class="truncate font-mono text-micro text-stone-400 line-through">{scheme.teamName}</span>
            {/if}
          </p>

          <div>
            <div class="h-2 overflow-hidden rounded-full border border-ink-900/40 bg-ink-900/60">
              <div
                class="h-full bg-blood-400 transition-[width] duration-300"
                style="width: {schemePct}%"
                role="progressbar"
                aria-valuenow={schemePct}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-label="Scheme progress"
              ></div>
            </div>
            <p class="mt-0.5 font-mono text-micro text-stone-400">{schemeTally}</p>
          </div>
        </div>
      </article>
    {/if}

    <div class="space-y-2 px-3 pb-2" class:pt-2={!scheme}>
      <div class="flex items-baseline justify-between">
        <span class="text-micro text-stone-400">MOOD</span>
        <span class="font-display {scheme ? 'text-body-sm' : 'text-title'} {moodTone}">
          {sim.keeper.mood.toUpperCase()}
        </span>
      </div>

      {#if sim.keeper.lastAct}
        <div
          class="rounded-sm border-l-2 px-2 py-1 {sim.keeper.lastAct === 'observe'
            ? 'border-stone-600 bg-ink-900/40'
            : 'border-arcane-400 bg-ink-900/60'}"
        >
          <div class="flex items-baseline justify-between font-mono text-micro">
            <span class="text-stone-400">TODAY</span>
            <span class="text-stone-500">{actAge}</span>
          </div>
          <p
            class="text-body-sm {sim.keeper.lastAct === 'observe'
              ? 'text-stone-500 italic'
              : moodTone}"
          >
            {sim.keeper.lastActText}
          </p>
        </div>
      {/if}

      <div>
        <div class="flex justify-between font-mono text-micro">
          <span class="text-stone-400">TREASURY</span>
          <span class="text-rank-gold">{sim.keeper.treasuryCp.toLocaleString()}cp</span>
        </div>
        <div class="mt-0.5 h-2 overflow-hidden rounded-full bg-ink-900/60">
          <div class="h-full bg-rank-gold transition-[width] duration-300" style="width: {treasuryPct}%"></div>
        </div>
      </div>

      {#if sim.keeper.loanCp > 0}
        <div>
          <div class="flex justify-between font-mono text-micro">
            <span class="text-stone-400">KHAN LOAN</span>
            <span class="text-blood-300">{sim.keeper.loanCp.toLocaleString()}cp</span>
          </div>
          <div class="mt-0.5 h-2 overflow-hidden rounded-full bg-ink-900/60">
            <div class="h-full bg-blood-400 transition-[width] duration-300" style="width: {loanPct}%"></div>
          </div>
        </div>
      {/if}

      <dl class="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-micro tabular">
        <div class="flex justify-between"><dt class="text-stone-400">STAFF</dt><dd>{sim.keeper.staff}</dd></div>
        <div class="flex justify-between"><dt class="text-stone-400">SLAIN</dt><dd class="text-blood-300">{sim.keeper.heroesSlain}</dd></div>
        <div class="flex justify-between"><dt class="text-stone-400">ENTRY</dt><dd>{sim.keeper.entryFeeCp}cp</dd></div>
        <div class="flex justify-between"><dt class="text-stone-400">TOLL</dt><dd>{(sim.keeper.tollBp / 100).toFixed(0)}%</dd></div>
        <div class="flex justify-between"><dt class="text-stone-400">CORPSE</dt><dd>{(sim.keeper.corpseTaxBp / 100).toFixed(0)}%</dd></div>
        <div class="flex justify-between"><dt class="text-stone-400">AGGRO</dt><dd>{sim.keeper.aggression.toFixed(2)}</dd></div>
        <div class="flex justify-between"><dt class="text-stone-400">FAME</dt><dd>{sim.keeper.fame}</dd></div>
      </dl>

      {#if sim.keeper.austerity}
        <p class="rounded-sm border border-blood-400 px-2 py-1 font-mono text-micro text-blood-300">
          AUSTERITY — GUARDIANS UNPAID
        </p>
      {/if}

      {#if sim.keeper.decree}
        <p class="border-l-2 border-arcane-400 pl-2 text-body-sm text-arcane-300 italic">
          “{sim.keeper.decree}”
        </p>
      {/if}
    </div>

    {#if records.length > 0}
      <div class="border-t-2 border-ink-900">
        <h3 class="px-3 py-1 text-label text-parchment-300">THE BOOK OF RECORDS</h3>
        <ul class="px-3 pb-2">
          {#each records as record (record.kind)}
            <li class="flex items-baseline gap-2 border-b border-ink-900/40 py-0.5 last:border-0" title={record.label}>
              <span class="w-14 shrink-0 font-mono text-micro text-stone-400">
                {RECORD_NAME[record.kind] ?? record.kind.toUpperCase()}
              </span>
              <span class="shrink-0 font-mono text-num tabular text-rank-gold">
                {recordValue(record.kind, record.value)}
              </span>
              <span class="min-w-0 flex-1 truncate text-right text-micro text-stone-300">
                {record.holder}{record.teamName && record.teamName !== record.holder
                  ? ` · ${record.teamName}`
                  : ''}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {:else}
    <p class="px-3 py-4 text-center text-body-sm text-stone-500">No keeper data.</p>
  {/if}
</section>
