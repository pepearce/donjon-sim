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
      ? 'border-poison-400 text-poison-300'
      : sim.connection === 'stale' || sim.connection === 'offline'
        ? 'border-blood-400 text-blood-300'
        : 'border-torch-400 text-torch-300',
  );
</script>

<span
  role="status"
  class="inline-flex h-7 items-center gap-1.5 rounded-full border-2 px-2.5 text-micro {tone}"
>
  <span
    class="size-2 rounded-full"
    class:bg-poison-400={sim.connection === 'live'}
    class:bg-blood-400={sim.connection === 'stale' || sim.connection === 'offline'}
    class:bg-torch-400={sim.connection === 'connecting' || sim.connection === 'reconnecting'}
    class:animate-pulse={sim.connection === 'connecting' || sim.connection === 'reconnecting'}
  ></span>
  {label}
  {#if sim.retryInSec > 0}
    <span class="font-mono opacity-70">{sim.retryInSec}s</span>
  {/if}
</span>
