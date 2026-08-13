<script lang="ts">
  import { onMount } from 'svelte';
  import { createMotion } from '$lib/applyFrame.js';
  import { createSimStore, setMotion } from '$lib/store.svelte.js';
  import { connect } from '$lib/connection.svelte.js';

  let { children } = $props();

  const sim = createSimStore();
  const motion = createMotion();
  setMotion(motion);

  onMount(() => {
    const connection = connect(sim, motion);
    return () => connection.close();
  });
</script>

{@render children()}
