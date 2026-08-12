<script lang="ts">
  let { data } = $props();
  const snap = $derived(data.snapshot);
</script>

<svelte:head>
  <title>Donjon Sim — text view</title>
  <meta name="description" content="A non-visual, screen-reader friendly view of the dungeon simulation." />
</svelte:head>

<main class="mx-auto max-w-3xl px-4 py-8 text-on-surface">
  <a href="/" class="text-accent underline">Back to the map view</a>

  <h1 class="mt-4 font-display text-display-md text-torch-300">Donjon Sim — text view</h1>

  {#if data.offline || !snap}
    <p class="mt-6 text-blood-300">The simulation is not reachable right now. Reload to try again.</p>
  {:else}
    <p class="mt-2 text-body-sm text-stone-300">
      Tick {snap.tick}, day {snap.world.day}, {snap.world.watch.toLowerCase().replace('_', ' ')} watch.
      This page is a static snapshot; reload for the current state.
    </p>

    <section class="mt-8" aria-labelledby="h-dungeon">
      <h2 id="h-dungeon" class="font-display text-title text-parchment-200">The dungeon</h2>
      <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
        <dt class="text-stone-400">Keeper's mood</dt><dd>{snap.keeper.mood}</dd>
        <dt class="text-stone-400">Treasury</dt><dd>{snap.keeper.treasuryCp.toLocaleString()} copper</dd>
        <dt class="text-stone-400">Outstanding loan</dt><dd>{snap.keeper.loanCp.toLocaleString()} copper</dd>
        <dt class="text-stone-400">Monsters employed</dt><dd>{snap.keeper.staff}</dd>
        <dt class="text-stone-400">Heroes slain to date</dt><dd>{snap.keeper.heroesSlain}</dd>
        <dt class="text-stone-400">Heroes living</dt><dd>{snap.heroesLiving}</dd>
        <dt class="text-stone-400">Waiting in the tavern</dt><dd>{snap.tavernSize}</dd>
        <dt class="text-stone-400">Floors open</dt><dd>{snap.floors.length}</dd>
      </dl>
      {#if snap.keeper.decree}
        <p class="mt-2 text-body-sm italic">Current decree: {snap.keeper.decree}</p>
      {/if}
    </section>

    <section class="mt-8" aria-labelledby="h-floors">
      <h2 id="h-floors" class="font-display text-title text-parchment-200">Floors</h2>
      <table class="mt-2 w-full text-left text-table">
        <thead>
          <tr class="text-stone-400">
            <th scope="col" class="py-1">Depth</th>
            <th scope="col">Name</th>
            <th scope="col">Rooms</th>
            <th scope="col">Parties present</th>
          </tr>
        </thead>
        <tbody>
          {#each snap.floors as floor (floor.id)}
            <tr class="border-t border-stone-800">
              <td class="py-1">{floor.depth}</td>
              <td>{floor.name}</td>
              <td>{floor.roomCount}</td>
              <td>{floor.teamCount}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section class="mt-8" aria-labelledby="h-teams">
      <h2 id="h-teams" class="font-display text-title text-parchment-200">Parties in the dungeon</h2>
      {#each snap.teams as team (team.id)}
        <article class="mt-4 border-t border-stone-800 pt-2">
          <h3 class="text-body font-bold">{team.name}</h3>
          <p class="text-body-sm text-stone-300 italic">{team.motto}</p>
          <p class="text-body-sm">
            Currently {team.state} on floor {team.floorId}, in {team.roomName}.
            Morale {team.morale} of 100. Purse {team.goldCp.toLocaleString()} copper.
          </p>
          <ul class="mt-1 list-disc pl-6 text-body-sm">
            {#each team.heroes as hero (hero.id)}
              <li>
                {hero.name}, level {hero.level} {hero.species} {hero.className},
                {hero.line} line —
                {hero.state === 'ok'
                  ? `${hero.hp} of ${hero.hpMax} health`
                  : hero.state === 'downed'
                    ? 'down and bleeding out'
                    : 'fallen'}
              </li>
            {/each}
          </ul>
        </article>
      {:else}
        <p class="text-body-sm">No parties are in the dungeon.</p>
      {/each}
    </section>

    <section class="mt-8" aria-labelledby="h-rank">
      <h2 id="h-rank" class="font-display text-title text-parchment-200">Leaderboard</h2>
      <ol class="mt-2 list-decimal pl-6 text-body-sm">
        {#each snap.leaderboard as row (row.teamId)}
          <li>{row.name} — renown {row.renown}, deepest floor {row.deepestFloor}, {row.alive} still standing</li>
        {/each}
      </ol>
    </section>

    <section class="mt-8" aria-labelledby="h-fallen">
      <h2 id="h-fallen" class="font-display text-title text-parchment-200">
        The fallen ({snap.casualties} in total)
      </h2>
      <ul class="mt-2 list-disc pl-6 text-body-sm">
        {#each snap.memorial as hero (hero.id)}
          <li>
            {hero.name}, level {hero.level} {hero.className} of {hero.teamName},
            died at tick {hero.diedTick} with {hero.kills} kills
          </li>
        {:else}
          <li>Nobody has died yet.</li>
        {/each}
      </ul>
    </section>

    <section class="mt-8" aria-labelledby="h-events">
      <h2 id="h-events" class="font-display text-title text-parchment-200">Recent events</h2>
      <ol class="mt-2 space-y-1 text-body-sm">
        {#each [...snap.events].reverse() as event (event.id)}
          <li><span class="text-stone-500">Tick {event.tick}:</span> {event.text}</li>
        {/each}
      </ol>
    </section>
  {/if}
</main>
