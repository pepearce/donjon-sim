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
            : 'text-parchment-100',
  );
</script>

<div class="flex min-w-[112px] flex-col gap-0.5">
  <span class="text-micro text-stone-400">{label}</span>
  <span class="font-mono text-stat leading-none {toneClass}">{value}</span>
  {#if hint}
    <span class="text-micro text-stone-500">{hint}</span>
  {/if}
</div>
