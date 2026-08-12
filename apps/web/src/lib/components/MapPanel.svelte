<script lang="ts">
  import { onMount } from 'svelte';
  import type { FloorMapDTO } from '@donjon/shared';
  import { MapRenderer } from '../canvas/renderer.js';
  import { createDirectorState, pickTeam, DRAMA_WINDOW_MS, type DirectorState } from '../canvas/director.js';
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
    const key = `${floorId}:${b64}`;
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
  let mapEpoch = $state('');
  let reducedMotion = $state(false);
  let viewMoved = $state(false);

  let directorState: DirectorState = createDirectorState();
  let dragging = false;
  let dragX = 0;
  let dragY = 0;
  let dragDistance = 0;

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

  function releaseAuto(): void {
    if (sim.follow) sim.follow = false;
    if (sim.director) sim.director = false;
  }

  function markMoved(): void {
    viewMoved = true;
  }

  function resetView(): void {
    renderer?.resetView();
    viewMoved = false;
  }

  function zoomStep(factor: number): void {
    if (!renderer) return;
    renderer.zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, factor);
    markMoved();
  }

  function onPointerDown(event: PointerEvent): void {
    if (!renderer || event.button !== 0) return;
    dragging = true;
    dragDistance = 0;
    dragX = event.clientX;
    dragY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!dragging || !renderer) return;
    const dx = event.clientX - dragX;
    const dy = event.clientY - dragY;
    dragX = event.clientX;
    dragY = event.clientY;
    dragDistance += Math.abs(dx) + Math.abs(dy);
    if (dragDistance > 4) releaseAuto();
    renderer.panBy(dx, dy);
    markMoved();
  }

  function onPointerUp(event: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!renderer || event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? 120 : 40;
    switch (event.key) {
      case 'ArrowLeft':
        renderer.panBy(step, 0);
        break;
      case 'ArrowRight':
        renderer.panBy(-step, 0);
        break;
      case 'ArrowUp':
        renderer.panBy(0, step);
        break;
      case 'ArrowDown':
        renderer.panBy(0, -step);
        break;
      case '+':
      case '=':
        zoomStep(1.25);
        break;
      case '-':
      case '_':
        zoomStep(0.8);
        break;
      case '0':
        resetView();
        return;
      default:
        return;
    }
    event.preventDefault();
    releaseAuto();
    markMoved();
  }

  onMount(() => {
    const r = new MapRenderer(canvas);
    renderer = r;
    r.start();
    if (sim.floorMap) {
      mapCache.set(sim.floorMap.id, sim.floorMap);
    }

    const query = matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = query.matches;
    const onQuery = (): void => {
      reducedMotion = query.matches;
    };
    query.addEventListener('change', onQuery);

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      const factor = Math.exp(-event.deltaY * unit * 0.0018);
      r.zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
      releaseAuto();
      markMoved();
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const meter = setInterval(() => {
      frameMs = Math.round(r.lastFrameMs * 100) / 100;
    }, 1000);

    return () => {
      clearInterval(meter);
      query.removeEventListener('change', onQuery);
      canvas.removeEventListener('wheel', onWheel);
      r.stop();
      mapCache.clear();
      renderer = null;
    };
  });

  $effect(() => {
    const epoch = sim.epoch;
    if (epoch === '' || epoch === mapEpoch) return;
    const first = mapEpoch === '';
    mapEpoch = epoch;
    if (first) return;
    mapCache.clear();
    tilesCacheKey = '';
    tilesCache = null;
    loadedFloor = 0;
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
    renderer.setFxQueue(motion.fx);
    renderer.setPositionSource(
      reducedMotion ? null : (id, fx, fy) => interpolate(motion, id, sim.playbackTick, fx, fy),
    );
  });

  $effect(() => {
    renderer?.setReducedMotion(reducedMotion);
  });

  $effect(() => {
    const auto = sim.follow || sim.director;
    renderer?.setFollow(auto);
    if (auto) viewMoved = false;
  });

  $effect(() => {
    if (!sim.director) {
      directorState = createDirectorState();
      return;
    }
    const cut = (): void => {
      const r = renderer;
      if (!r) return;
      const now = performance.now();
      directorState = pickTeam(directorState, {
        teams: sim.teams,
        drama: r.dramaSince(now - DRAMA_WINDOW_MS),
        now,
      });
      if (directorState.teamId !== null && directorState.teamId !== sim.selectedTeam) {
        sim.autoSelect = true;
        sim.selectedTeam = directorState.teamId;
      }
    };
    const timer = setInterval(cut, 450);
    return () => clearInterval(timer);
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

  const autoMode = $derived(sim.director ? 'director' : sim.follow ? 'follow' : 'free');

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
        class="absolute inset-0 size-full cursor-grab touch-none active:cursor-grabbing"
        tabindex="0"
        role="application"
        aria-label={mapSummary}
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
        onkeydown={onKeyDown}
      ></canvas>

      <div class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
        <p
          class="font-mono text-micro uppercase tracking-widest {autoMode === 'free'
            ? 'text-stone-400'
            : 'text-torch-300'}"
        >
          {autoMode === 'director' ? 'Director' : autoMode === 'follow' ? 'Follow' : 'Free look'}
        </p>
        <div class="pointer-events-auto flex gap-1">
          <button
            type="button"
            class="ink bg-stone-900/90 px-2 py-1 font-mono text-micro text-parchment-200 hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-torch-300"
            onclick={() => zoomStep(0.8)}
          >
            <span aria-hidden="true">–</span><span class="sr-only">Zoom the map out</span>
          </button>
          <button
            type="button"
            class="ink bg-stone-900/90 px-2 py-1 font-mono text-micro text-parchment-200 hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-torch-300"
            onclick={() => zoomStep(1.25)}
          >
            <span aria-hidden="true">+</span><span class="sr-only">Zoom the map in</span>
          </button>
          <button
            type="button"
            class="ink bg-stone-900/90 px-2 py-1 font-mono text-micro uppercase tracking-widest {viewMoved
              ? 'text-torch-300'
              : 'text-stone-400'} hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-torch-300"
            onclick={resetView}
          >
            Reset view
          </button>
        </div>
      </div>
    </div>
  </div>

  <p class="sr-only">{mapSummary}</p>
  <p class="sr-only">
    Map view controls: focus the map, then use the arrow keys to pan, plus and minus to zoom, and
    zero to reset the view. Mouse wheel zooms toward the pointer and dragging pans.
  </p>
</section>
