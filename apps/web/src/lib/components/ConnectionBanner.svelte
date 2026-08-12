<script lang="ts">
  import { useSim } from '../store.svelte.js';

  const sim = useSim();

  const label = $derived(
    sim.connection === 'live'
      ? 'LIVE'
      : sim.connection === 'connecting'
        ? 'CONNECTING'
        : sim.connection === 'reconnecting'
          ? 'RECONNECTING'
          : sim.connection === 'stale'
            ? 'STALE'
            : 'OFFLINE',
  );

  const tone = $derived(
    sim.connection === 'live'
      ? 'border-poison-400 bg-poison-700/25 text-poison-300'
      : sim.connection === 'stale' || sim.connection === 'offline'
        ? 'border-blood-400 bg-sev-3-wash text-blood-300'
        : 'border-torch-400 bg-sev-2-wash text-torch-300',
  );

  const pending = $derived(sim.connection === 'connecting' || sim.connection === 'reconnecting');
</script>

<span
  role="status"
  class="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm border-2 px-2 font-mono text-micro shadow-ink-sm {tone}"
>
  <span
    class="size-2 shrink-0 rounded-full"
    class:bg-poison-400={sim.connection === 'live'}
    class:animate-ember={sim.connection === 'live'}
    class:bg-blood-400={sim.connection === 'stale' || sim.connection === 'offline'}
    class:bg-torch-400={pending}
    class:animate-pulse={pending}
  ></span>
  {label}
  {#if sim.retryInSec > 0}
    <span class="tabular opacity-70">{sim.retryInSec}s</span>
  {/if}
</span>
