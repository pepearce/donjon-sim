<script lang="ts">
  import type { TeamPublic } from '@donjon/shared';
  import { teamColor } from '../design/teams.js';
  import { useSim } from '../store.svelte.js';
  import { hpTone, standingWord } from './dossier.js';

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
  const accent = $derived(teamColor(team.colorIndex));
  const crew = $derived(
    team.heroes.map((h) => ({
      id: h.id,
      name: h.name,
      initial: h.name.slice(0, 1).toUpperCase(),
      alive: h.alive,
      pct: Math.max(0, Math.round((h.hp / Math.max(1, h.hpMax)) * 100)),
      label: `${h.name}, level ${h.level} ${h.className}, ${h.hp} of ${h.hpMax} health${h.alive ? '' : ', fallen'}`,
    })),
  );
  const summary = $derived(
    `${team.name}. ${alive} of ${team.heroes.length} standing on floor ${team.floorId}. Renown ${team.renown}, standing ${standingWord(team.standing)}. ${crew.map((c) => c.label).join('. ')}`,
  );

  function select(): void {
    sim.selectedTeam = selected ? null : team.id;
    sim.selectedFloor = team.floorId;
  }
</script>

<button
  type="button"
  onclick={select}
  aria-pressed={selected}
  class="ink w-full rounded-md bg-panel px-3 py-2 text-left text-ink shadow-ink-sm transition-[box-shadow,border-color,transform] duration-150"
  class:opacity-50={dead}
  class:border-torch-400={selected}
  class:shadow-ink={selected}
  class:-translate-y-px={selected}
  class:bg-panel-raised={selected}
>
  <span class="sr-only">{summary}</span>

  <div aria-hidden="true" class="flex items-center gap-2">
    <span
      class="flex size-5 shrink-0 items-center justify-center rounded-sm border-2 border-ink-900 font-mono text-micro leading-none text-ink"
      style="background: {accent}">{team.monogram}</span
    >
    <h3 class="truncate font-display text-title leading-none" class:line-through={dead}>{team.name}</h3>
    {#if selected}
      <span class="shrink-0 rounded-full bg-ink-900 px-1.5 py-0.5 font-mono text-micro text-torch-300">
        OPEN
      </span>
    {/if}
    <span class="ml-auto shrink-0 font-mono text-micro text-stone-600">F{team.floorId}</span>
  </div>

  <p aria-hidden="true" class="mt-0.5 truncate text-micro text-stone-600 italic">{team.motto}</p>

  <div aria-hidden="true" class="mt-1.5 grid grid-cols-6 gap-1">
    {#each crew as member (member.id)}
      <span class="block" title={member.label}>
        <span
          class="flex h-4 items-center justify-center rounded-t-sm border border-ink-900/30 font-mono text-micro leading-none"
          class:bg-parchment-200={member.alive}
          class:text-ink-800={member.alive}
          class:bg-stone-300={!member.alive}
          class:text-stone-600={!member.alive}
          class:line-through={!member.alive}
        >
          {member.initial}
        </span>
        <span class="block h-1 overflow-hidden rounded-b-sm bg-ink-900/20">
          <span
            class="block h-full {member.alive ? hpTone(member.pct) : 'bg-stone-500'}"
            style="width: {member.alive ? member.pct : 100}%"
          ></span>
        </span>
      </span>
    {/each}
  </div>

  <div aria-hidden="true" class="mt-1.5 space-y-1">
    <div class="h-2 overflow-hidden rounded-full border border-ink-900/20 bg-ink-900/10">
      <div class="h-full {hpTone(hpPct)} transition-[width] duration-300" style="width: {hpPct}%"></div>
    </div>
    <div class="h-2 overflow-hidden rounded-full border border-ink-900/20 bg-ink-900/10">
      <div class="h-full bg-arcane-400 transition-[width] duration-300" style="width: {team.morale}%"></div>
    </div>
  </div>

  <dl aria-hidden="true" class="mt-1.5 grid grid-cols-[auto_auto_1fr] gap-x-3 font-mono text-micro text-stone-700">
    <div class="flex gap-1"><dt>REN</dt><dd class="text-torch-700">{team.renown}</dd></div>
    <div class="flex gap-1">
      <dt>STAND</dt>
      <dd class:text-poison-700={team.standing > 0} class:text-blood-700={team.standing < 0}>
        {team.standing > 0 ? '+' : ''}{team.standing}
      </dd>
    </div>
    <div class="flex gap-1 truncate"><dt>GOLD</dt><dd class="truncate">{team.goldCp}</dd></div>
    <div class="flex gap-1"><dt>MOR</dt><dd>{team.morale}</dd></div>
    <div class="col-span-2 flex gap-1 truncate">
      <dt>AT</dt>
      <dd class="truncate">{team.roomName}</dd>
    </div>
  </dl>
</button>
