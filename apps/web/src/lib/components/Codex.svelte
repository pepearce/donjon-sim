<script lang="ts">
  import { CLASS_MEANINGS, SPECIES_MEANINGS, TRAIT_MEANINGS } from './dossier.js';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  const CLASS_NUMBERS: Record<string, { primary: string; hp: number; atk: number; def: number; line: string }> = {
    sabreur: { primary: 'STR', hp: 4, atk: 2, def: 1, line: 'front' },
    thaumaturge: { primary: 'WIL', hp: 1, atk: 2, def: 0, line: 'back' },
    sapper: { primary: 'AGI', hp: 3, atk: 1, def: 2, line: 'front' },
    cutpurse: { primary: 'AGI', hp: 2, atk: 2, def: 1, line: 'front' },
    bruiser: { primary: 'STR', hp: 6, atk: 1, def: 2, line: 'front' },
    pretre: { primary: 'WIL', hp: 3, atk: 0, def: 1, line: 'back' },
  };

  const SPECIES_NUMBERS: Record<string, { str: number; agi: number; wil: number; hp: number }> = {
    duck: { str: 9, agi: 13, wil: 11, hp: 10 },
    toad: { str: 11, agi: 9, wil: 13, hp: 11 },
    mole: { str: 12, agi: 10, wil: 10, hp: 12 },
    ferret: { str: 9, agi: 14, wil: 10, hp: 9 },
    boar: { str: 14, agi: 8, wil: 10, hp: 14 },
    crow: { str: 9, agi: 12, wil: 13, hp: 9 },
    rabbit: { str: 10, agi: 13, wil: 9, hp: 10 },
    lizard: { str: 11, agi: 12, wil: 10, hp: 11 },
    badger: { str: 13, agi: 9, wil: 11, hp: 13 },
    cat: { str: 10, agi: 14, wil: 11, hp: 10 },
  };

  const classes = Object.entries(CLASS_MEANINGS);
  const species = Object.entries(SPECIES_MEANINGS);
  const traits = Object.entries(TRAIT_MEANINGS);
</script>

<section
  class="ink flex h-full min-h-0 flex-col bg-dossier text-ink shadow-lift"
  aria-label="Codex"
>
  <header class="shrink-0 border-b-2 border-dossier-edge bg-dossier-tab px-3 py-2">
    <div class="flex items-center gap-2">
      <h2 class="min-w-0 flex-1 truncate font-display text-display-sm leading-none">CODEX</h2>
      <button
        type="button"
        class="ink shrink-0 rounded-sm bg-parchment-100 px-2 py-1 font-mono text-micro"
        onclick={onclose}
      >
        CLOSE
      </button>
    </div>
    <p class="mt-1 text-body-sm text-ink-muted italic">
      The trades, lineages and dispositions the clerks have on file.
    </p>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto p-3">
    <h3 class="font-mono text-micro text-stone-600">THE SIX TRADES</h3>
    <ul class="mt-1 space-y-2">
      {#each classes as [id, cls] (id)}
        {@const n = CLASS_NUMBERS[id]}
        <li class="ink rounded-md bg-dossier-sunken p-2">
          <p class="flex items-baseline gap-2">
            <span class="font-display text-title">{cls.label}</span>
            {#if n}
              <span
                class="ink-hair rounded-full px-2 py-0.5 font-mono text-micro {n.line === 'front'
                  ? 'border-torch-700/50 text-torch-700'
                  : 'border-arcane-700/45 text-arcane-700'}"
              >
                {n.line.toUpperCase()}
              </span>
              <span class="ml-auto font-mono text-micro text-stone-600">
                {n.primary} · +{n.hp}HP +{n.atk}A +{n.def}D
              </span>
            {/if}
          </p>
          <p class="mt-0.5 text-body-sm text-ink-800">{cls.blurb}</p>
          <p class="mt-1 text-body-sm text-ink-800">
            <span class="font-mono text-micro text-torch-700">{cls.act.toUpperCase()}</span>
            — {cls.actBlurb}
          </p>
        </li>
      {/each}
    </ul>

    <h3 class="mt-4 font-mono text-micro text-stone-600">THE TEN LINEAGES</h3>
    <ul class="mt-1 space-y-1">
      {#each species as [id, sp] (id)}
        {@const n = SPECIES_NUMBERS[id]}
        <li class="ink rounded-md bg-dossier-sunken px-2 py-1.5">
          <p class="flex items-baseline gap-2">
            <span class="font-display text-title">{sp.label}</span>
            {#if n}
              <span class="ml-auto font-mono text-micro text-stone-600">
                STR {n.str} · AGI {n.agi} · WIL {n.wil} · {n.hp}HP
              </span>
            {/if}
          </p>
          <p class="mt-0.5 text-body-sm text-ink-800">{sp.blurb}</p>
        </li>
      {/each}
    </ul>

    <h3 class="mt-4 font-mono text-micro text-stone-600">THE DISPOSITIONS</h3>
    <ul class="mt-1 space-y-1">
      {#each traits as [id, trait] (id)}
        <li class="ink rounded-md bg-dossier-sunken px-2 py-1.5">
          <p class="flex items-baseline gap-2">
            <span class="font-display text-title">{trait.label}</span>
          </p>
          <p class="mt-0.5 text-body-sm text-ink-800">{trait.blurb}</p>
        </li>
      {/each}
    </ul>

    <p class="mt-4 text-body-sm text-stone-600 italic">
      A hero's line is a temperament, not an order: the bold and the reckless drift forward, the
      cautious and the craven drift back, whatever the trade says.
    </p>
  </div>
</section>
