<script lang="ts">
  import type { TeamPublic } from '@donjon/shared';
  import { teamColor } from '../design/teams.js';
  import { useSim } from '../store.svelte.js';

  interface Props {
    team: TeamPublic;
  }

  let { team }: Props = $props();
  const sim = useSim();

  const alive = $derived(team.heroes.filter((h) => h.alive).length);
  const hp = $derived(team.heroes.reduce((n, h) => n + h.hp, 0));
  const hpMax = $derived(team.heroes.reduce((n, h) => n + h.hpMax, 0) || 1);
  const hpPct = $derived(Math.round((hp / hpMax) * 100));
  const selected = $derived(sim.selectedTeam === team.id);
  const dead = $derived(alive === 0);

  function select(): void {
    sim.selectedTeam = selected ? null : team.id;
    sim.selectedFloor = team.floorId;
  }
</script>

<button
  type="button"
  onclick={select}
  aria-pressed={selected}
  class="w-full rounded-md border-2 border-ink-900 bg-panel px-3 py-2 text-left text-ink shadow-ink-sm transition-colors duration-150"
  class:opacity-50={dead}
  class:ring-2={selected}
  class:ring-torch-400={selected}
>
  <div class="flex items-center gap-2">
    <span
      class="size-3 shrink-0 rounded-full border-2 border-ink-900"
      style="background: {teamColor(team.colorIndex)}"
    ></span>
    <h3 class="truncate font-display text-title leading-none" class:line-through={dead}>{team.name}</h3>
    <span class="ml-auto shrink-0 font-mono text-micro text-stone-600">F{team.floorId}</span>
  </div>

  <p class="mt-0.5 truncate text-micro text-stone-600 italic">{team.motto}</p>

  <div class="mt-1.5 flex items-center gap-1">
    {#each team.heroes as hero (hero.id)}
      <span
        class="size-2.5 rounded-full border border-ink-900"
        class:bg-poison-400={hero.alive}
        class:bg-stone-400={!hero.alive}
        title="{hero.name} — L{hero.level} {hero.className} ({hero.hp}/{hero.hpMax})"
      ></span>
    {/each}
    <span class="ml-auto font-mono text-micro text-stone-600">{team.state}</span>
  </div>

  <div class="mt-1.5 space-y-1">
    <div class="h-2 overflow-hidden rounded-full border border-ink-900/20 bg-ink-900/10">
      <div
        class="h-full transition-[width] duration-300"
        class:bg-poison-400={hpPct > 50}
        class:bg-torch-400={hpPct <= 50 && hpPct > 25}
        class:bg-blood-400={hpPct <= 25}
        style="width: {hpPct}%"
        role="progressbar"
        aria-valuenow={hpPct}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Party health"
      ></div>
    </div>
    <div class="h-2 overflow-hidden rounded-full border border-ink-900/20 bg-ink-900/10">
      <div
        class="h-full bg-arcane-400 transition-[width] duration-300"
        style="width: {team.morale}%"
        role="progressbar"
        aria-valuenow={team.morale}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-label="Party morale"
      ></div>
    </div>
  </div>

  <dl class="mt-1.5 flex gap-3 font-mono text-micro text-stone-700">
    <div class="flex gap-1"><dt>GOLD</dt><dd>{team.goldCp}</dd></div>
    <div class="flex gap-1"><dt>MOR</dt><dd>{team.morale}</dd></div>
    <div class="flex gap-1 truncate"><dt>AT</dt><dd class="truncate">{team.roomName}</dd></div>
  </dl>
</button>
