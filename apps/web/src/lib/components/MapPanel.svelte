<script lang="ts">
  import { onMount } from 'svelte';
  import type { FloorMapDTO } from '@donjon/shared';
  import { MapRenderer } from '../canvas/renderer.js';
  import { interpolate } from '../applyFrame.js';
  import { followFloor } from '../floorview.js';
  import { useMotion, useSim } from '../store.svelte.js';
  import FloorSelector from './FloorSelector.svelte';

  const sim = useSim();
  const motion = useMotion();

  let tilesCacheKey = '';
  let tilesCache: Uint8Array | null = null;

  function decodeTiles(floorId: number): Uint8Array | null {
    const b64 = sim.fogTiles[String(floorId)];
    if (!b64) return null;
    const key = `${floorId}:${b64.length}:${b64.slice(-24)}`;
    if (key === tilesCacheKey) return tilesCache;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    tilesCacheKey = key;
    tilesCache = out;
    return out;
  }

  let canvas: HTMLCanvasElement;
  let renderer: MapRenderer | null = $state(null);
  let frameMs = $state(0);
  let loadedFloor = $state(0);
  let loadRequest = $state(0);
  let followedFloor = $state<number | null>(null);

  const mapCache = new Map<number, FloorMapDTO>();

  async function loadFloor(id: number): Promise<void> {
    if (!renderer) return;
    const cached = mapCache.get(id);
    if (cached) {
      renderer.setMap(cached);
      loadedFloor = id;
      return;
    }
    try {
      const res = await fetch(`/api/v1/floors/${id}/map`);
      if (!res.ok) {
        loadRequest += 1;
        return;
      }
      const map = (await res.json()) as FloorMapDTO;
      if (mapCache.size > 5) mapCache.clear();
      mapCache.set(id, map);
      if (id !== sim.selectedFloor) return;
      renderer.setMap(map);
      loadedFloor = id;
    } catch {
      loadRequest += 1;
    }
  }

  onMount(() => {
    const r = new MapRenderer(canvas);
    renderer = r;
    r.start();
    if (sim.floorMap) {
      mapCache.set(sim.floorMap.id, sim.floorMap);
    }

    const meter = setInterval(() => {
      frameMs = Math.round(r.lastFrameMs * 100) / 100;
    }, 1000);

    return () => {
      clearInterval(meter);
      r.stop();
      mapCache.clear();
      renderer = null;
    };
  });

  $effect(() => {
    const id = sim.selectedFloor;
    void loadRequest;
    if (renderer && id !== loadedFloor) void loadFloor(id);
  });

  $effect(() => {
    const target = followFloor(sim.selectedTeam, sim.tokens, followedFloor);
    if (sim.selectedTeam === null) {
      followedFloor = null;
      return;
    }
    if (target === null) return;
    followedFloor = target;
    sim.selectedFloor = target;
  });

  $effect(() => {
    const teamId = sim.selectedTeam;
    if (teamId === null) {
      sim.fog = null;
      sim.sight = [];
      return;
    }

    let cancelled = false;
    const pull = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/v1/teams/${teamId}/fog`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          explored: Record<string, number[]>;
          sight: number[];
          floorId: number;
          tiles: Record<string, string>;
        };
        if (cancelled) return;
        sim.fog = data.explored;
        sim.sight = data.sight;
        sim.fogTiles = data.tiles ?? {};
      } catch {
        if (!cancelled) sim.fog = null;
      }
    };

    void pull();
    const timer = setInterval(() => void pull(), 1200);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  });

  $effect(() => {
    if (!renderer) return;
    renderer.setTokens(sim.tokens);
    renderer.setMonsters(sim.monsters);

    const fogForFloor = sim.fog === null ? null : new Set(sim.fog[String(loadedFloor)] ?? []);
    const team = sim.teams.find((t) => t.id === sim.selectedTeam);
    const sightForFloor =
      fogForFloor && team && team.floorId === loadedFloor ? new Set(sim.sight) : null;
    renderer.setFog(fogForFloor, sightForFloor, sim.selectedTeam, decodeTiles(loadedFloor));

    if (!motion) return;
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPositionSource(
      reduced
        ? null
        : (id, fx, fy) => interpolate(motion, id, sim.playbackTick, fx, fy),
    );
  });

  $effect(() => {
    if (sim.dt <= 0) return;
    let raf = 0;
    let last = performance.now();

    const advance = (now: number): void => {
      const elapsed = now - last;
      last = now;
      const target = sim.tick;
      const err = target - sim.playbackTick;
      const rate = Math.max(0.9, Math.min(1.1, 1 + err * 0.15));
      if (Math.abs(err) > 12) sim.playbackTick = target;
      else {
        sim.playbackTick += (elapsed / sim.dt) * rate;
        if (sim.playbackTick > target + 0.5) sim.playbackTick = target + 0.5;
      }
      raf = requestAnimationFrame(advance);
    };

    raf = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(raf);
  });

  const floorInfo = $derived(sim.floors.find((f) => f.id === loadedFloor));

  const mapSummary = $derived(
    floorInfo
      ? `${floorInfo.name}, floor ${floorInfo.depth}, ${floorInfo.roomCount} rooms. ` +
          `${sim.tokens.filter((t) => t.floorId === loadedFloor).length} teams present: ` +
          (sim.teams
            .filter((t) => t.floorId === loadedFloor)
            .map((t) => `${t.name} in ${t.roomName}`)
            .join('; ') || 'none')
      : 'Map loading.',
  );
</script>

<section class="flex min-h-0 flex-1 flex-col" aria-label="Dungeon map">
  <header
    class="flex h-10 shrink-0 items-center justify-between border-b-2 border-ink-900 bg-stone-900 px-3"
  >
    <h2 class="truncate font-display text-title text-parchment-200">
      {floorInfo?.name ?? 'The Ground Floor'}
    </h2>
    <span class="shrink-0 font-mono text-micro text-stone-400">
      tick {sim.tick} · seq {sim.seq} · {frameMs}ms
    </span>
  </header>

  <div class="flex min-h-0 flex-1">
    <FloorSelector />
    <div class="relative min-h-0 flex-1">
      <canvas
        bind:this={canvas}
        class="absolute inset-0 size-full touch-none"
        tabindex="0"
        role="application"
        aria-label={mapSummary}
      ></canvas>
    </div>
  </div>

  <p class="sr-only">{mapSummary}</p>
</section>
