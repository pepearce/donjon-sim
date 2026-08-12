<script lang="ts">
  import { useSim } from '../store.svelte.js';

  const sim = useSim();

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
</script>

<section class="flex shrink-0 flex-col border-t-2 border-ink-900" aria-label="Dungeon status">
  <h2 class="border-b-2 border-ink-900 px-3 py-1.5 text-label text-parchment-300">THE KEEPER</h2>

  {#if sim.keeper}
    <div class="space-y-2 px-3 py-2">
      <div class="flex items-baseline justify-between">
        <span class="text-micro text-stone-400">MOOD</span>
        <span class="font-display text-title {moodTone}">{sim.keeper.mood.toUpperCase()}</span>
      </div>

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

      <dl class="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-micro">
        <div class="flex justify-between"><dt class="text-stone-400">STAFF</dt><dd>{sim.keeper.staff}</dd></div>
        <div class="flex justify-between"><dt class="text-stone-400">SLAIN</dt><dd class="text-blood-300">{sim.keeper.heroesSlain}</dd></div>
        <div class="flex justify-between"><dt class="text-stone-400">ENTRY</dt><dd>{sim.keeper.entryFeeCp}cp</dd></div>
        <div class="flex justify-between"><dt class="text-stone-400">TOLL</dt><dd>{(sim.keeper.tollBp / 100).toFixed(0)}%</dd></div>
        <div class="flex justify-between"><dt class="text-stone-400">AGGRO</dt><dd>{sim.keeper.aggression.toFixed(2)}</dd></div>
        <div class="flex justify-between"><dt class="text-stone-400">FAME</dt><dd>{sim.keeper.fame}</dd></div>
      </dl>

      {#if sim.keeper.austerity}
        <p class="rounded-sm border border-blood-400 px-2 py-1 text-micro text-blood-300">
          AUSTERITY — guardians unpaid
        </p>
      {/if}

      {#if sim.keeper.decree}
        <p class="border-l-2 border-arcane-400 pl-2 text-micro text-arcane-300 italic">
          “{sim.keeper.decree}”
        </p>
      {/if}
    </div>
  {:else}
    <p class="px-3 py-4 text-center text-body-sm text-stone-500">No keeper data.</p>
  {/if}
</section>
