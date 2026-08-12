<script lang="ts">
  import { DAY_TICKS } from '@donjon/shared';
  import { useSim } from '../store.svelte.js';
  import Memorial from './Memorial.svelte';

  const sim = useSim();

  const TABS = ['ledger', 'records', 'fallen'] as const;
  type Tab = (typeof TABS)[number];

  const TAB_LABEL: Record<Tab, string> = {
    ledger: 'LEDGER',
    records: 'RECORDS',
    fallen: 'THE FALLEN',
  };

  let tab = $state<Tab>('ledger');

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

  const RUNG_LABEL: Record<string, string> = {
    favored: 'FAVORED OF THE KHAN',
    good: 'IN GOOD STANDING',
    censured: 'CENSURED',
    overseer: 'UNDER OVERSEER',
  };

  const rungTone = $derived(
    sim.keeper?.rung === 'favored'
      ? 'text-rank-gold'
      : sim.keeper?.rung === 'censured'
        ? 'text-torch-300'
        : sim.keeper?.rung === 'overseer'
          ? 'text-blood-300'
          : 'text-parchment-300',
  );

  const rungBar = $derived(
    sim.keeper?.rung === 'favored'
      ? 'bg-rank-gold'
      : sim.keeper?.rung === 'censured'
        ? 'bg-torch-400'
        : sim.keeper?.rung === 'overseer'
          ? 'bg-blood-400'
          : 'bg-parchment-300',
  );

  const gambit = $derived(sim.keeper?.gambit ?? null);
  const gambitPct = $derived(
    !gambit ? 0 : Math.max(0, Math.min(100, Math.round((gambit.collectedCp / Math.max(1, gambit.targetCp)) * 100))),
  );

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

<section class="flex h-full min-h-0 flex-col" aria-label="The Keeper">
  <header class="shrink-0 border-b-2 border-ink-900 px-3 py-1.5">
    <div class="flex items-baseline gap-2">
      <h2 class="truncate font-display text-title leading-none text-parchment-200">
        {sim.keeper?.name || 'THE KEEPER'}
      </h2>
      {#if sim.keeper?.trait}
        <span class="shrink-0 rounded-xs border border-arcane-400 px-1 font-mono text-micro uppercase text-arcane-300">
          {sim.keeper.trait}
        </span>
      {/if}
      {#if sim.keeper}
        <span class="ml-auto shrink-0 font-mono text-micro {moodTone}">{sim.keeper.mood.toUpperCase()}</span>
      {/if}
    </div>
    {#if sim.keeper}
      <div class="mt-1">
        <div class="flex justify-between font-mono text-micro">
          <span class={rungTone}>{RUNG_LABEL[sim.keeper.rung] ?? sim.keeper.rung.toUpperCase()}</span>
          <span class="text-stone-500">{sim.keeper.standing}/100</span>
        </div>
        <div class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ink-900/60">
          <div
            class="h-full {rungBar} transition-[width] duration-300"
            style="width: {sim.keeper.standing}%"
            role="progressbar"
            aria-valuenow={sim.keeper.standing}
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="Standing with the Khan"
          ></div>
        </div>
      </div>
    {/if}
  </header>

  {#if sim.keeper}
    {#if sim.keeper.overseer}
      <p class="mx-2 mt-2 shrink-0 rounded-sm border-2 border-blood-500 bg-sev-3-wash px-2 py-1 font-mono text-micro text-blood-300">
        {sim.keeper.overseerName ? sim.keeper.overseerName.toUpperCase() : 'THE KHAN’S OVERSEER'} PRESIDES —
        TOLLS SKIMMED, DECREES SUSPENDED
      </p>
    {/if}

    {#if gambit}
      <article class="m-2 shrink-0 rounded-sm border-2 border-torch-400 bg-sev-2-wash shadow-ink-sm">
        <header class="flex items-center gap-1.5 border-b-2 border-torch-400/60 px-2 py-1">
          <span class="size-2 shrink-0 rounded-full bg-torch-400 animate-ember"></span>
          <span class="font-mono text-micro text-torch-300">GAMBIT IN MOTION</span>
          <span class="ml-auto shrink-0 font-mono text-micro text-stone-300">{gambit.daysLeft}d LEFT</span>
        </header>
        <div class="space-y-1.5 px-2 py-1.5">
          <p class="text-body-sm text-stone-200">
            {gambit.stakeCp.toLocaleString()}cp staked with the Khan — wring
            {gambit.targetCp.toLocaleString()}cp of tolls before the window closes, double or nothing.
          </p>
          <div>
            <div class="h-2 overflow-hidden rounded-full border border-ink-900/40 bg-ink-900/60">
              <div
                class="h-full bg-torch-400 transition-[width] duration-300"
                style="width: {gambitPct}%"
                role="progressbar"
                aria-valuenow={gambitPct}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-label="Gambit progress"
              ></div>
            </div>
            <p class="mt-0.5 font-mono text-micro text-stone-400">
              {gambit.collectedCp.toLocaleString()} of {gambit.targetCp.toLocaleString()}cp collected
            </p>
          </div>
        </div>
      </article>
    {/if}
    {#if scheme}
      <article class="m-2 shrink-0 rounded-sm border-2 border-blood-500 bg-sev-3-wash shadow-ink-sm">
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
            <span class="font-mono text-micro text-stone-500">MARKED</span>
            {#if sim.teams.some((t) => t.id === scheme.teamId)}
              <button
                type="button"
                onclick={() => selectTeam(scheme.teamId)}
                class="truncate rounded-xs border border-blood-400 px-1.5 py-0.5 font-mono text-micro text-blood-300 hover:bg-blood-400/15"
              >
                {scheme.teamName} ›
              </button>
            {:else}
              <span class="truncate font-mono text-micro text-stone-500 line-through">{scheme.teamName}</span>
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

    {#if sim.keeper.lastAct && sim.keeper.lastAct !== 'observe'}
      <div class="mx-2 mb-2 shrink-0 rounded-sm border-l-2 border-arcane-400 bg-ink-900/60 px-2 py-1">
        <div class="flex items-baseline justify-between font-mono text-micro">
          <span class="text-stone-500">TODAY</span>
          <span class="text-stone-600">{actAge}</span>
        </div>
        <p class="text-body-sm {moodTone}">{sim.keeper.lastActText}</p>
      </div>
    {/if}

    <div class="flex shrink-0 gap-3 border-y border-ink-900 px-3" role="group" aria-label="Keeper records">
      {#each TABS as t (t)}
        <button
          type="button"
          onclick={() => (tab = t)}
          aria-pressed={tab === t}
          class="-mb-px border-b-2 py-1 font-mono text-micro transition-colors"
          class:border-torch-400={tab === t}
          class:text-parchment-200={tab === t}
          class:border-transparent={tab !== t}
          class:text-stone-500={tab !== t}
        >
          {TAB_LABEL[t]}{#if t === 'fallen'}<span class="ml-1 text-blood-300">{sim.casualties}</span>{/if}
        </button>
      {/each}
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if tab === 'ledger'}
        <div class="space-y-2 px-3 py-2">
          <div>
            <div class="flex justify-between font-mono text-micro">
              <span class="text-stone-500">TREASURY</span>
              <span class="text-rank-gold">{sim.keeper.treasuryCp.toLocaleString()}cp</span>
            </div>
            <div class="mt-0.5 h-2 overflow-hidden rounded-full bg-ink-900/60">
              <div class="h-full bg-rank-gold transition-[width] duration-300" style="width: {treasuryPct}%"></div>
            </div>
          </div>

          {#if sim.keeper.loanCp > 0}
            <div>
              <div class="flex justify-between font-mono text-micro">
                <span class="text-stone-500">KHAN LOAN</span>
                <span class="text-blood-300">{sim.keeper.loanCp.toLocaleString()}cp</span>
              </div>
              <div class="mt-0.5 h-2 overflow-hidden rounded-full bg-ink-900/60">
                <div class="h-full bg-blood-400 transition-[width] duration-300" style="width: {loanPct}%"></div>
              </div>
            </div>
          {/if}

          <dl class="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-micro tabular text-stone-300">
            <div class="flex justify-between"><dt class="text-stone-500">STAFF</dt><dd>{sim.keeper.staff}</dd></div>
            <div class="flex justify-between"><dt class="text-stone-500">SLAIN</dt><dd class="text-blood-300">{sim.keeper.heroesSlain}</dd></div>
            <div class="flex justify-between"><dt class="text-stone-500">ENTRY</dt><dd>{sim.keeper.entryFeeCp}cp</dd></div>
            <div class="flex justify-between"><dt class="text-stone-500">TOLL</dt><dd>{(sim.keeper.tollBp / 100).toFixed(0)}%</dd></div>
            <div class="flex justify-between"><dt class="text-stone-500">CORPSE</dt><dd>{(sim.keeper.corpseTaxBp / 100).toFixed(0)}%</dd></div>
            <div class="flex justify-between"><dt class="text-stone-500">AGGRO</dt><dd>{sim.keeper.aggression.toFixed(2)}</dd></div>
            <div class="flex justify-between"><dt class="text-stone-500">FAME</dt><dd>{sim.keeper.fame}</dd></div>
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
      {:else if tab === 'records'}
        <ul class="px-3 py-2">
          {#each records as record (record.kind)}
            <li class="flex items-baseline gap-2 border-b border-ink-900/40 py-1 last:border-0" title={record.label}>
              <span class="w-12 shrink-0 font-mono text-micro text-stone-500">
                {RECORD_NAME[record.kind] ?? record.kind.toUpperCase()}
              </span>
              <span class="shrink-0 font-mono text-num tabular text-rank-gold">
                {recordValue(record.kind, record.value)}
              </span>
              <span class="min-w-0 flex-1 truncate text-right text-micro text-stone-400">
                {record.holder}{record.teamName && record.teamName !== record.holder
                  ? ` · ${record.teamName}`
                  : ''}
              </span>
            </li>
          {:else}
            <li class="py-4 text-body-sm text-stone-500 italic">The book is still blank.</li>
          {/each}
        </ul>
      {:else}
        <Memorial />
      {/if}
    </div>
  {:else}
    <p class="px-3 py-4 text-center text-body-sm text-stone-500">No keeper data.</p>
  {/if}
</section>
