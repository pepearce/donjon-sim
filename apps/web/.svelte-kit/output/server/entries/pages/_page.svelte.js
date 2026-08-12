import { a2 as setContext, g as getContext, a4 as attr_class, e as escape_html, a3 as derived, a5 as attr, a6 as ensure_array_like, a7 as attr_style, a8 as stringify } from "../../chunks/index.js";
import "clsx";
const KEY = Symbol("donjon.sim");
const TICKER_CAPACITY = 200;
class SimStore {
  tick = 0;
  day = 0;
  watch = "POTRON_MINET";
  seq = 0;
  dt = 1e3;
  frameTs = 0;
  casualties = 0;
  teams = [];
  tokens = [];
  ticker = [];
  floorMap = null;
  connection = "connecting";
  lastFrameAt = 0;
  retryInSec = 0;
  epoch = "";
  speed = 1;
  maxEventId = 0;
  get isStale() {
    return this.connection === "stale" || this.connection === "offline";
  }
  get heroesAlive() {
    return this.teams.reduce((n, t) => n + t.heroes.filter((h) => h.alive).length, 0);
  }
  applyBootstrap(boot) {
    this.epoch = boot.server.epoch;
    this.speed = boot.server.speed;
    this.applySnapshot(boot.snapshot);
  }
  applySnapshot(snap) {
    this.tick = snap.tick;
    this.day = snap.world.day;
    this.watch = snap.world.watch;
    this.seq = snap.seq;
    this.dt = snap.dt;
    this.frameTs = snap.ts;
    this.casualties = snap.casualties;
    this.teams = snap.teams;
    this.tokens = snap.tokens;
    this.lastFrameAt = Date.now();
    const fresh = snap.events.filter((e) => e.id > this.maxEventId);
    if (fresh.length > 0) {
      this.maxEventId = fresh[fresh.length - 1]?.id ?? this.maxEventId;
      const merged = [...this.ticker, ...fresh];
      this.ticker = merged.slice(Math.max(0, merged.length - TICKER_CAPACITY));
    }
  }
}
function createSimStore() {
  const store = new SimStore();
  setContext(KEY, store);
  return store;
}
function useSim() {
  const store = getContext(KEY);
  if (!store) throw new Error("SimStore is not in context");
  return store;
}
function ConnectionBanner($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const sim = useSim();
    const label = derived(() => sim.connection === "live" ? "LIVE" : sim.connection === "connecting" ? "CONNECTING" : sim.connection === "reconnecting" ? "RECONNECTING" : sim.connection === "stale" ? "STALE" : "OFFLINE");
    const tone = derived(() => sim.connection === "live" ? "border-poison-400 text-poison-300" : sim.connection === "stale" || sim.connection === "offline" ? "border-blood-400 text-blood-300" : "border-torch-400 text-torch-300");
    $$renderer2.push(`<span role="status"${attr_class(`inline-flex h-7 items-center gap-1.5 rounded-full border-2 px-2.5 text-micro ${tone()}`)}><span${attr_class("size-2 rounded-full", void 0, {
      "bg-poison-400": sim.connection === "live",
      "bg-blood-400": sim.connection === "stale" || sim.connection === "offline",
      "bg-torch-400": sim.connection === "connecting" || sim.connection === "reconnecting",
      "animate-pulse": sim.connection === "connecting" || sim.connection === "reconnecting"
    })}></span> ${escape_html(label())} `);
    if (sim.retryInSec > 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="font-mono opacity-70">${escape_html(sim.retryInSec)}s</span>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></span>`);
  });
}
const TEAM_COLORS = [
  "#DE4F11",
  "#C5B204",
  "#BDFC18",
  "#5FEF91",
  "#73F6D5",
  "#33F7FC",
  "#3DC2FC",
  "#8D6EFE",
  "#A46AA9",
  "#F384BD"
];
function teamColor(colorIndex) {
  return TEAM_COLORS[colorIndex % TEAM_COLORS.length] ?? TEAM_COLORS[0];
}
function MapPanel($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const sim = useSim();
    let frameMs = 0;
    const mapSummary = derived(() => sim.floorMap ? `Floor ${sim.floorMap.depth}, ${sim.floorMap.width} by ${sim.floorMap.height} tiles, ${sim.floorMap.rooms.length} rooms. ${sim.teams.length} teams present: ` + sim.teams.map((t) => `${t.name} in ${t.roomName}`).join("; ") : "Map loading.");
    $$renderer2.push(`<section class="relative flex min-h-0 flex-1 flex-col" aria-label="Dungeon map"><header class="flex h-10 shrink-0 items-center justify-between border-b-2 border-ink-900 bg-stone-900 px-3"><h2 class="text-label text-parchment-300">${escape_html(sim.floorMap?.name ?? "The Ground Floor")}</h2> <span class="font-mono text-micro text-stone-300">tick ${escape_html(sim.tick)} · seq ${escape_html(sim.seq)} · ${escape_html(frameMs)}ms/frame</span></header> <div class="relative min-h-0 flex-1"><canvas class="absolute inset-0 size-full touch-none" tabindex="0" role="application"${attr("aria-label", mapSummary())}></canvas></div> <p class="sr-only" aria-live="off">${escape_html(mapSummary())}</p></section>`);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    const sim = createSimStore();
    if (data.bootstrap) sim.applyBootstrap(data.bootstrap);
    if (data.floorMap) sim.floorMap = data.floorMap;
    $$renderer2.push(`<div class="dash-grid svelte-1uha8ag"><header class="col-span-full flex h-14 items-center gap-6 border-2 border-ink-900 bg-stone-900 px-4 shadow-ink" style="grid-area: topbar"><h1 class="font-display text-display-sm text-torch-300">DONJON</h1> <dl class="flex items-center gap-6 text-micro text-stone-300"><div class="flex items-center gap-1.5"><dt class="opacity-70">FALLEN</dt> <dd class="font-mono text-body-sm text-blood-300">${escape_html(sim.casualties)}</dd></div> <div class="flex items-center gap-1.5"><dt class="opacity-70">HEROES</dt> <dd class="font-mono text-body-sm text-parchment-100">${escape_html(sim.heroesAlive)}</dd></div> <div class="flex items-center gap-1.5"><dt class="opacity-70">TEAMS</dt> <dd class="font-mono text-body-sm text-parchment-100">${escape_html(sim.teams.length)}/10</dd></div> <div class="flex items-center gap-1.5"><dt class="opacity-70">DAY</dt> <dd class="font-mono text-body-sm text-parchment-100">${escape_html(sim.day)}</dd></div> <div class="flex items-center gap-1.5"><dt class="opacity-70">WATCH</dt> <dd class="font-mono text-body-sm text-parchment-100">${escape_html(sim.watch)}</dd></div></dl> <div class="ml-auto">`);
    ConnectionBanner($$renderer2);
    $$renderer2.push(`<!----></div></header> <aside class="flex min-h-0 flex-col gap-2 overflow-y-auto border-2 border-ink-900 bg-stone-900 p-2" style="grid-area: roster" aria-label="Teams"><h2 class="text-label text-parchment-300">TEAMS</h2> `);
    const each_array = ensure_array_like(sim.teams);
    if (each_array.length !== 0) {
      $$renderer2.push("<!--[-->");
      for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
        let team = each_array[$$index_1];
        $$renderer2.push(`<article class="rounded-md border-2 border-ink-900 bg-panel px-3 py-2.5 text-ink shadow-ink-sm"><div class="flex items-center gap-2"><span class="size-3 shrink-0 rounded-full border-2 border-ink-900"${attr_style(`background: ${stringify(teamColor(team.colorIndex))}`)}></span> <h3 class="font-display text-title leading-none">${escape_html(team.name)}</h3></div> <p class="mt-1 text-micro text-stone-600 italic">${escape_html(team.motto)}</p> <p class="mt-1.5 text-table">${escape_html(team.heroes.filter((h) => h.alive).length)} heroes · ${escape_html(team.roomName)}</p> <div class="mt-1.5 flex gap-1"><!--[-->`);
        const each_array_1 = ensure_array_like(team.heroes);
        for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
          let hero = each_array_1[$$index];
          $$renderer2.push(`<span${attr_class("size-2.5 rounded-full border border-ink-900", void 0, { "bg-poison-400": hero.alive, "bg-stone-400": !hero.alive })}${attr("title", `${stringify(hero.name)} — ${stringify(hero.className)}`)}></span>`);
        }
        $$renderer2.push(`<!--]--></div> <dl class="mt-2 flex gap-3 font-mono text-micro text-stone-700"><div class="flex gap-1"><dt>MOR</dt><dd>${escape_html(team.morale)}</dd></div> <div class="flex gap-1"><dt>ROOMS</dt><dd>${escape_html(team.roomsExplored)}</dd></div></dl></article>`);
      }
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<p class="text-body-sm text-stone-400">No teams yet.</p>`);
    }
    $$renderer2.push(`<!--]--></aside> <div class="flex min-h-0 flex-col border-2 border-ink-900 bg-stone-950" style="grid-area: map">`);
    MapPanel($$renderer2);
    $$renderer2.push(`<!----></div> <section class="flex min-h-0 flex-col border-2 border-ink-900 bg-stone-900" style="grid-area: ticker" aria-label="Event feed"><h2 class="shrink-0 border-b-2 border-ink-900 px-3 py-1.5 text-label text-parchment-300">EVENTS</h2> <ol class="min-h-0 flex-1 overflow-y-auto px-2 py-1 font-mono text-table" role="log" aria-live="off"><!--[-->`);
    const each_array_2 = ensure_array_like(sim.ticker.slice(-60).reverse());
    for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
      let event = each_array_2[$$index_2];
      $$renderer2.push(`<li class="flex gap-2 px-1 py-0.5"><span class="shrink-0 text-stone-500">t${escape_html(String(event.tick).padStart(6, "0"))}</span> <span class="text-parchment-200">${escape_html(event.text)}</span></li>`);
    }
    $$renderer2.push(`<!--]--></ol></section></div>`);
  });
}
export {
  _page as default
};
