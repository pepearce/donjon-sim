<script lang="ts">
  interface Props {
    label: string;
    value: string | number;
    tone?: 'default' | 'danger' | 'success' | 'gold' | 'keeper';
    hint?: string;
  }

  let { label, value, tone = 'default', hint = '' }: Props = $props();

  const toneClass = $derived(
    tone === 'danger'
      ? 'text-blood-300'
      : tone === 'success'
        ? 'text-poison-300'
        : tone === 'gold'
          ? 'text-rank-gold'
          : tone === 'keeper'
            ? 'text-arcane-300'
            : 'text-parchment-50',
  );
</script>

<div class="flex min-w-[92px] shrink-0 flex-col justify-center">
  <span class="truncate font-mono text-micro leading-none text-stone-500">{label}</span>
  <span class="mt-1 font-mono text-stat-xl leading-none tabular {toneClass}">{value}</span>
  {#if hint}
    <span class="mt-1 truncate text-micro leading-none text-stone-600">{hint}</span>
  {/if}
</div>
