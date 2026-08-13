<script lang="ts">
  import SpeedControl from '$lib/components/SpeedControl.svelte';

  interface Tunable {
    key: string;
    group: string;
    label: string;
    default: number;
    min: number;
    max: number;
    step: number;
    value: number;
    overridden: boolean;
    updatedAt: number | null;
  }

  let tunables = $state<Tunable[]>([]);
  let search = $state('');
  let error = $state('');
  let loaded = $state(false);
  let collapsed = $state<Record<string, boolean>>({});
  let drafts = $state<Record<string, string>>({});

  const groups = $derived.by(() => {
    const q = search.trim().toLowerCase();
    const visible = tunables.filter(
      (t) => !q || t.key.toLowerCase().includes(q) || t.label.toLowerCase().includes(q),
    );
    const byGroup = new Map<string, Tunable[]>();
    for (const t of visible) {
      const list = byGroup.get(t.group) ?? [];
      list.push(t);
      byGroup.set(t.group, list);
    }
    return [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

  async function load(): Promise<void> {
    try {
      const res = await fetch('/api/tunables');
      const body = await res.json();
      if (!res.ok) {
        error = body?.error?.message ?? 'failed to load tunables';
        return;
      }
      error = '';
      tunables = body.tunables;
      drafts = {};
    } catch {
      error = 'the simulation admin port is not answering';
    } finally {
      loaded = true;
    }
  }

  function patch(updated: Tunable): void {
    tunables = tunables.map((t) => (t.key === updated.key ? updated : t));
    delete drafts[updated.key];
  }

  async function save(t: Tunable): Promise<void> {
    const raw = drafts[t.key];
    if (raw === undefined || raw === String(t.value)) return;
    if (raw.trim() === '') {
      drafts[t.key] = String(t.value);
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      drafts[t.key] = String(t.value);
      return;
    }
    const res = await fetch('/api/tunables', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'set', key: t.key, value }),
    });
    const body = await res.json();
    if (!res.ok) {
      error = body?.error?.message ?? 'save failed';
      drafts[t.key] = String(t.value);
      return;
    }
    error = '';
    patch(body.tunable);
  }

  async function reset(t: Tunable): Promise<void> {
    const res = await fetch('/api/tunables', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'reset', key: t.key }),
    });
    const body = await res.json();
    if (res.ok) {
      error = '';
      patch(body.tunable);
    } else {
      error = body?.error?.message ?? 'reset failed';
    }
  }

  async function resetAll(): Promise<void> {
    if (!confirm('Reset every tunable to its code default?')) return;
    const res = await fetch('/api/tunables', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'reset-all' }),
    });
    if (res.ok) await load();
    else {
      const body = await res.json();
      error = body?.error?.message ?? 'reset all failed';
    }
  }

  $effect(() => {
    void load();
  });
</script>

<svelte:head>
  <title>Donjon Sim — tunables</title>
</svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 text-on-surface">
  <a href="/" class="text-accent underline">Back to the board</a>

  <header class="mt-4 flex flex-wrap items-center gap-3">
    <div>
      <h1 class="font-display text-display-md text-torch-300">Tunables</h1>
      <p class="mt-1 text-body-sm text-stone-400">
        Live knobs the keeper's economy and rosters run on. Changes take effect immediately.
      </p>
    </div>
    <div class="flex items-center gap-3">
      <SpeedControl />
      <input
        class="w-56 rounded-sm ink-hair border-stone-700 bg-stone-900 px-2 py-1.5 text-body-sm text-parchment-100 placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-focus"
        placeholder="Search…"
        aria-label="Search tunables"
        bind:value={search}
      />
      <button
        type="button"
        class="rounded-sm border border-blood-400 px-3 py-1.5 font-mono text-micro text-blood-300 hover:bg-blood-400/15"
        onclick={resetAll}
      >
        RESET ALL
      </button>
    </div>
  </header>

  {#if error}
    <p class="mt-4 rounded-sm border-2 border-blood-500 bg-sev-3-wash px-3 py-2 text-body-sm text-blood-300" role="status">
      {error}
    </p>
  {/if}

  {#if loaded && groups.length === 0}
    <p class="mt-6 text-body-sm text-stone-400">No tunables match "{search}".</p>
  {/if}

  <div class="mt-6 space-y-4">
    {#each groups as [group, entries] (group)}
      <section class="ink-hair rounded-md border-stone-700 bg-stone-900/60">
        <button
          type="button"
          class="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-stone-800/40"
          aria-expanded={!collapsed[group]}
          onclick={() => (collapsed[group] = !collapsed[group])}
        >
          <span class="font-display text-title text-parchment-200 capitalize">{group}</span>
          <span class="font-mono text-micro text-stone-500">
            {entries.length}
            <span aria-hidden="true">{collapsed[group] ? ' ▸' : ' ▾'}</span>
          </span>
        </button>
        {#if !collapsed[group]}
          <ul class="divide-y divide-stone-800">
            {#each entries as t (t.key)}
              <li class="flex items-center gap-3 px-4 py-2">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-body-sm text-parchment-100">{t.label}</p>
                  <p class="truncate font-mono text-micro text-stone-500">{t.key} · default {t.default}</p>
                </div>
                {#if t.overridden}
                  <span class="rounded-sm bg-sev-2-wash px-1.5 py-0.5 font-mono text-micro text-torch-300">
                    modified
                  </span>
                  <button
                    type="button"
                    class="font-mono text-micro text-stone-400 hover:text-torch-300"
                    onclick={() => reset(t)}
                  >
                    reset
                  </button>
                {/if}
                <input
                  type="number"
                  class="w-28 rounded-sm ink-hair border-stone-700 bg-stone-950 px-2 py-1 text-right font-mono text-num text-parchment-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-focus"
                  aria-label="{t.label} value"
                  min={t.min}
                  max={t.max}
                  step={t.step}
                  value={drafts[t.key] ?? t.value}
                  oninput={(e) => (drafts[t.key] = e.currentTarget.value)}
                  onblur={() => save(t)}
                  onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}
  </div>
</main>
