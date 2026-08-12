<script lang="ts">
  import { useSim } from '../store.svelte.js';

  const sim = useSim();

  const SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 30] as const;

  let busy = $state(false);
  let paused = $state(false);
  let error = $state('');

  async function send(body: Record<string, unknown>): Promise<void> {
    busy = true;
    error = '';
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: { message?: string } };
        error = j.error?.message ?? 'control failed';
      }
    } catch {
      error = 'control unreachable';
    } finally {
      busy = false;
    }
  }

  async function setSpeed(speed: number): Promise<void> {
    await send({ action: 'speed', speed });
    if (!error) sim.speed = speed;
  }

  async function togglePause(): Promise<void> {
    const next = !paused;
    await send({ action: next ? 'pause' : 'resume' });
    if (!error) paused = next;
  }
</script>

<div class="flex items-center gap-1" role="group" aria-label="Simulation speed">
  <button
    type="button"
    onclick={togglePause}
    disabled={busy}
    aria-pressed={paused}
    title={paused ? 'Resume the simulation' : 'Pause the simulation'}
    class="rounded-sm border-2 border-ink-900 bg-panel px-2 py-0.5 font-mono text-micro text-ink disabled:opacity-50"
  >
    {paused ? '▶' : '❚❚'}
  </button>

  {#if paused}
    <button
      type="button"
      onclick={() => send({ action: 'step' })}
      disabled={busy}
      title="Advance exactly one tick"
      class="rounded-sm border-2 border-ink-900 bg-panel px-2 py-0.5 font-mono text-micro text-ink disabled:opacity-50"
    >
      +1
    </button>
  {/if}

  {#each SPEEDS as s (s)}
    <button
      type="button"
      onclick={() => setSpeed(s)}
      disabled={busy}
      aria-pressed={sim.speed === s}
      title="{s}× — one in-world minute every {(1 / s).toFixed(2)}s"
      class="rounded-sm border border-transparent px-1.5 py-0.5 font-mono text-micro transition-colors hover:text-parchment-200 disabled:opacity-50"
      class:border-torch-400={sim.speed === s}
      class:bg-sev-2-wash={sim.speed === s}
      class:text-torch-300={sim.speed === s}
      class:text-stone-500={sim.speed !== s}
    >
      {s}×
    </button>
  {/each}

  {#if error}
    <span class="ml-1 text-micro text-blood-300">{error}</span>
  {/if}
</div>
