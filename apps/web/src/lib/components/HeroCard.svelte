<script lang="ts">
  import { DAY_TICKS, type HeroDetailDTO } from '@donjon/shared';
  import { useSim } from '../store.svelte.js';
  import { classMeaning, coin, fightLine, hpTone, rarityChip, relationWord, speciesMeaning, traitMeaning, xpSpent } from './dossier.js';

  interface Props {
    hero: HeroDetailDTO;
    accent: string;
  }

  let { hero, accent }: Props = $props();
  const sim = useSim();

  const open = $derived(sim.selectedHero === hero.id);
  const hpPct = $derived(Math.max(0, Math.round((hero.hp / Math.max(1, hero.hpMax)) * 100)));
  const xpInto = $derived(Math.max(0, hero.xp - xpSpent(hero.level)));
  const xpPct = $derived(
    hero.xpToNext > 0 ? Math.min(100, Math.round((xpInto / hero.xpToNext) * 100)) : 100,
  );
  const served = $derived(Math.max(0, sim.tick - hero.bornTick));
  const service = $derived(
    served >= DAY_TICKS
      ? `${Math.floor(served / DAY_TICKS)}d`
      : `${Math.floor(served / (DAY_TICKS / 24))}h`,
  );
  const bonds = $derived(
    [...hero.relations].sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 6),
  );
  const bodyId = $derived(`hero-body-${hero.id}`);

  function toggle(): void {
    sim.selectedHero = open ? null : hero.id;
  }
</script>

<li class="ink rounded-md bg-dossier-sunken" class:opacity-70={!hero.alive}>
  <h4>
    <button
      type="button"
      onclick={toggle}
      aria-expanded={open}
      aria-controls={bodyId}
      class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
    >
      <span
        class="ink flex size-7 shrink-0 items-center justify-center rounded-sm font-mono text-micro text-ink"
        style="background: {accent}"
        aria-hidden="true">{hero.level}</span
      >
      <span class="min-w-0 flex-1">
        <span class="block truncate text-title leading-tight">
          <span class:line-through={!hero.alive}>{hero.name}</span>
          {#if !hero.alive}
            <span aria-hidden="true" class="text-blood-700">†</span>
            <span class="sr-only">, fallen</span>
          {/if}
        </span>
        {#if hero.epithet}
          <span class="block truncate font-display text-body-sm leading-tight text-torch-700">
            {hero.epithet}
          </span>
        {/if}
        <span class="block truncate font-mono text-micro text-stone-600">
          L{hero.level}
          {hero.species}
          {hero.className} · {hero.kills}<span aria-hidden="true">⚔</span><span class="sr-only">
            kills</span
          >
        </span>
      </span>
      <span class="w-16 shrink-0">
        <span class="block text-right font-mono text-micro text-stone-600">
          {hero.hp}/{hero.hpMax}
        </span>
        <span class="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-ink-900/15">
          <span
            class="block h-full {hero.alive ? hpTone(hpPct) : 'bg-stone-500'}"
            style="width: {hero.alive ? hpPct : 100}%"
          ></span>
        </span>
      </span>
      <span aria-hidden="true" class="shrink-0 font-mono text-micro text-stone-600">
        {open ? '▾' : '▸'}
      </span>
    </button>
  </h4>

  <div id={bodyId} class="px-2 pb-2" class:hidden={!open}>
    <p class="mb-1.5 text-body-sm text-ink-800 italic">{fightLine(hero)}</p>
    <div class="flex flex-wrap items-center gap-1">
      <span
        class="ink-hair rounded-full px-2 py-0.5 font-mono text-micro {hero.line === 'front'
          ? 'border-torch-700/50 text-torch-700'
          : 'border-arcane-700/45 text-arcane-700'}"
      >
        {hero.line === 'front' ? 'FRONT' : 'BACK'}
      </span>
      <span
        class="ink-hair rounded-full bg-parchment-100 px-2 py-0.5 font-mono text-micro text-ink-800"
        title={classMeaning(hero.className).blurb}
      >
        {classMeaning(hero.className).label}
      </span>
      <span
        class="ink-hair rounded-full bg-parchment-100 px-2 py-0.5 font-mono text-micro text-ink-800"
        title={speciesMeaning(hero.species).blurb}
      >
        {speciesMeaning(hero.species).label}
      </span>
      {#each hero.traits as trait (trait)}
        {@const meaning = traitMeaning(trait)}
        <span
          class="ink-hair rounded-full bg-parchment-100 px-2 py-0.5 font-mono text-micro text-ink-800"
          title={meaning.blurb}
        >
          {meaning.label}
        </span>
      {/each}
      {#if hero.scarred}
        <span class="ink-hair rounded-full border-blood-700/50 px-2 py-0.5 font-mono text-micro text-blood-700">
          SCARRED
        </span>
      {/if}
    </div>

    <dl class="mt-2 grid grid-cols-4 gap-1 text-center">
      <div class="ink-hair rounded-sm bg-parchment-100 py-1">
        <dt class="font-mono text-micro text-stone-600">STR</dt>
        <dd class="font-mono text-num text-ink">{hero.stats.str}</dd>
      </div>
      <div class="ink-hair rounded-sm bg-parchment-100 py-1">
        <dt class="font-mono text-micro text-stone-600">AGI</dt>
        <dd class="font-mono text-num text-ink">{hero.stats.agi}</dd>
      </div>
      <div class="ink-hair rounded-sm bg-parchment-100 py-1">
        <dt class="font-mono text-micro text-stone-600">WIL</dt>
        <dd class="font-mono text-num text-ink">{hero.stats.wil}</dd>
      </div>
      <div class="ink-hair rounded-sm bg-parchment-100 py-1">
        <dt class="font-mono text-micro text-stone-600">PURSE</dt>
        <dd class="font-mono text-num text-ink">{coin(hero.goldCp)}</dd>
      </div>
    </dl>

    <p class="mt-2 flex items-baseline justify-between font-mono text-micro text-stone-600">
      <span>XP {xpInto}/{hero.xpToNext}</span>
      <span>{service} in service</span>
    </p>
    <div
      class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ink-900/15"
      role="progressbar"
      aria-valuenow={xpPct}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-label="Experience toward next level"
    >
      <div class="h-full bg-arcane-400" style="width: {xpPct}%"></div>
    </div>

    {#if hero.nemesis}
      <p class="mt-2 ink-hair rounded-sm border-blood-700/40 bg-blood-100/40 px-2 py-1 text-body-sm text-ink-800">
        <span class="font-mono text-micro text-blood-700">NEMESIS</span>
        <span class="font-display"> {hero.nemesis}</span>
        <span class="text-stone-600">
          — has put them down {hero.nemesisDowns}
          {hero.nemesisDowns === 1 ? 'time' : 'times'}
        </span>
      </p>
    {/if}

    {#if bonds.length > 0}
      <h5 class="mt-2 font-mono text-micro text-stone-600">TIES</h5>
      <ul class="mt-1 space-y-1">
        {#each bonds as rel (rel.id)}
          <li class="flex items-center gap-2">
            <span
              class="w-14 shrink-0 font-mono text-micro"
              class:text-poison-700={rel.v > 0}
              class:text-blood-700={rel.v <= 0}
            >
              {rel.v > 0 ? 'BOND' : 'GRUDGE'}
            </span>
            <span class="min-w-0 flex-1 truncate text-body-sm text-ink-800">{rel.name}</span>
            <span class="shrink-0 text-micro text-stone-600 italic">{relationWord(rel.v)}</span>
            <span class="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-ink-900/15">
              <span
                class="block h-full"
                class:bg-poison-400={rel.v > 0}
                class:bg-blood-400={rel.v <= 0}
                style="width: {Math.min(100, Math.abs(rel.v))}%"
              ></span>
            </span>
            <span class="w-8 shrink-0 text-right font-mono text-micro text-stone-600">{rel.v}</span>
          </li>
        {/each}
      </ul>
    {/if}

    {#if hero.items.length > 0}
      <h5 class="mt-2 font-mono text-micro text-stone-600">CARRIED</h5>
      <ul class="mt-1 space-y-1">
        {#each hero.items as item, i (item.name + i)}
          <li class="flex items-center gap-2">
            <span class="ink-hair shrink-0 rounded-full px-1.5 py-0.5 font-mono text-micro {rarityChip(item.rarity)}">
              {item.rarity}
            </span>
            <span class="min-w-0 flex-1 truncate text-body-sm text-ink-800">{item.name}</span>
            <span class="shrink-0 font-mono text-micro text-stone-600">
              {item.atk > 0 ? `+${item.atk}A ` : ''}{item.def > 0 ? `+${item.def}D ` : ''}{item.dr >
              0
                ? `+${item.dr}R `
                : ''}{coin(item.valueCp)}
            </span>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="mt-2 text-body-sm text-stone-600 italic">Carrying nothing worth an entry.</p>
    {/if}
  </div>
</li>
