# Donjon Sim — Implementation Plan

## Context

A single-file, single-process, perpetually-running simulation of a for-profit dungeon (the Fortress of Gehenna, formerly Castle Cavallère) that advertises for adventurers, employs monsters, charges admission, and inventories the gear of the ones who die — which is all of them. Parties of anthropomorphic heroes form, delve, loot, argue, die; the Keeper bills them for it. A public web dashboard lets anyone watch: a canvas tile map with moving tokens, a live event feed, a leaderboard, the Keeper's balance sheet, and a memorial to the fallen.

**Intended outcome:** a world that runs for months without intervention, survives restarts without losing its history, and is still worth looking at on day 30. Zero runtime LLM — all narration comes from a deterministic template engine over hand-authored content packs. Node 22, TypeScript ESM, SQLite via better-sqlite3, SvelteKit + Tailwind v4, canvas tile grid.

## Architecture at a glance

```
┌─────────────────────── apps/sim  (ONE process, ONE thread, systemd unit) ───────────────────┐
│                                                                                              │
│   loop.ts ──tick(1000ms)──▶ engine.step() ──mutates──▶ World (in-memory, authoritative)      │
│      │                            │                          │                               │
│      │                            └─▶ world.pendingEvents[]   │ world.dirty: DirtySet         │
│      │                                world.tailRing (500)    │                               │
│      │                                                        │                               │
│      ├── every 1 tick ─▶ projector.snapshotBuffer(world) ─┐   │                               │
│      │                   (memoized on world.tick)          │   │                               │
│      ├── every 2 ticks ─▶ hub.broadcast(frame) ──setImmediate──▶ N × res.write(sharedBuffer)  │
│      │                        ring(600 frames)             │                                  │
│      └── every 30 ticks ─▶ flush.ts: ONE IMMEDIATE txn ────┴──▶ donjon.sqlite (WAL)           │
│                            world + dirty rows + events + ledger + stats                       │
│                                                                                               │
│   node:http :8787  GET /api/v1/{bootstrap,state,floors,teams,events,stream}  ← memory only    │
│   node:http 127.0.0.1:8788  /admin/*  (pause, step, speed, checkpoint, diag)                  │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
                                          │ SSE  text/event-stream
                                          ▼
┌───────────────── apps/web (SvelteKit adapter-node, :3000, separate systemd unit) ────────────┐
│  +page.server.ts ── SSR /api/v1/bootstrap ──▶ {snapshot, cursor}                              │
│  connection.svelte.ts ── fetch+ReadableStream SSE, ?since=<seq>, backoff, stall watchdog       │
│  applyFrame.ts (single writer) ──▶ SimStore ($state, SvelteMap)  ──▶ DOM panels               │
│                                └──▶ MotionBuffer (Float32Array, non-reactive) ──▶ canvas rAF  │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
                                          ▲
                              Caddy :443  │  /api/* → :8787 (flush_interval -1),  / → :3000
```

The simulation, the SQLite writer and the HTTP/SSE server share one thread because better-sqlite3 is synchronous and the engine is cheap (≈2–4 ms/tick at 10 teams). No HTTP handler touches SQLite on the hot path: every read is served from an in-memory projection whose JSON is serialized once per tick and shared by every client. The engine is pure — `step()` mutates the World and appends to two in-memory arrays; the host does all I/O. Determinism comes from deriving a fresh sfc32 PRNG per `(worldSeed, tick, domain, entityId, seq)`, so no stream state is ever persisted and adding a subsystem cannot perturb existing rolls. Persistence is write-behind: one transaction every 30 ticks carrying the world row, the dirty entity set, the event batch and the incrementally-maintained aggregates, so a crash loses ≤29 ticks and the DB is always a consistent tick boundary. The event log is a presentation artifact, never a source of truth — every lifetime statistic lives in `team_stats`/`hero_counters`/`dungeon` and is incremented in the same transaction that emits the event, which is what makes event rows freely deletable. Streaming is SSE: one full snapshot on connect, then one coalesced delta frame every 2 ticks, encoded once into a single Buffer written to every client. On restart the world **pauses** — sim time does not advance during downtime; there is no catch-up re-simulation anywhere in the system.

## Repository layout

npm workspaces (not pnpm — the raw-TS package export and Vite `ssr.noExternal` are best-tested there). `"type": "module"`, Node 22, TypeScript strict.

```
donjon-sim/
  package.json                      workspaces: ["apps/*","packages/*"]; scripts dev/build/check/test/soak
  tsconfig.base.json                strict, moduleResolution "bundler", target ES2023
  docs/
    template-dsl.md                 the template string grammar (docs, not code comments)
    invariants.md                   the 22 named invariants, their ids and rationale
  packages/shared/
    src/tick.ts                     TICK_MS=1000, DAY_TICKS=3600, every _EVERY constant derived
    src/events.ts                   EVENT_TYPES const array, EventType, Severity, SEVERITY map
    src/protocol.ts                 Frame, Op union, SnapshotDTO, TeamPublic, TokenPublic, MoveLeg
    src/rng.ts                      sfc32, mix32, streamSeed, rngFor, RngDomain (append-only)
    src/ids.ts                      branded Cp, Milli, TeamId, HeroId; bp() basis-point helper
    package.json                    exports "." -> "./src/index.ts" (no build step)
  packages/content/
    src/schema.ts                   zod schemas for every pack file; Pack type
    src/build.ts                    CLI: validate, cross-ref, precompile ASTs, emit dist/pack.<hash>.json
    src/loader.ts                   boot-time load, deep-freeze, indexed accessors
    src/parse.ts                    template string -> AST (literals, slots, pools, alternation, optional)
    src/render.ts                   AST walk, slot fill, filters, punctuation finalize
    src/select.ts                   candidate filter, weighting, recent-penalty, weighted draw
    src/grammar.ts                  articles, plurals, possessives, conjugation, coin formatting
    src/narrate.ts                  narrate() / narrateStateless() — pure, no I/O
    src/lint.ts                     CI lint: parse, slot coverage, id resolution, per-type counts
    packs/core/*.json               species, classes, names, monsters, items, rooms, traps,
                                    lexicon, voices, economy, team-names, epithets, templates/
  apps/sim/
    src/main.ts                     composition root: db, migrate, pack, world, servers, loop, signals
    src/config.ts                   zod env config; every tunable number
    src/log.ts                      pino root + child loggers (sim, http, sse, db, admin)
    src/engine/world.ts             World aggregate, DirtySet, digest(), toSnapshot/fromSnapshot
    src/engine/step.ts              the fixed, numbered phase pipeline (append-only)
    src/engine/scheduler.ts         min-heap of wake events (restock, respawn, bleed-out, corpse sweep)
    src/engine/emit.ts              pure emit(): assigns id, narrates, appends to pendingEvents+tailRing
    src/engine/systems/combat.ts    initiative, to-hit, crit, damage, downing, stabilise
    src/engine/systems/teamAi.ts    6-action utility argmax, quantised, hysteresis, overrides
    src/engine/systems/movement.ts  APSP next-hop lookup, leg emission, encounter trigger
    src/engine/systems/loot.ts      rarity by depth, value roll, restock purchase + mint
    src/engine/systems/traps.ts     detect/disarm/trigger, rearm cost + scheduling
    src/engine/systems/economy.ts   double-entry ledger, transfer/mint, restockCostFactor, conservation
    src/engine/systems/dungeon.ts   Keeper: aggression controller, restock policy, loan + repayment
    src/engine/systems/recruit.ts   tavern pool, team formation, population controller
    src/engine/systems/ranking.ts   renown_milli accrual + decay, leaderboard ordering
    src/engine/systems/progression.ts xp, levels, permadeath resolution, epithet counters
    src/engine/gen/floorgen.ts      deterministic floor generation, tile bitmap, room graph
    src/engine/gen/apsp.ts          BFS-per-room next-hop matrix + connectivity assert
    src/db/open.ts                  pragmas, writer connection, read-only reader
    src/db/migrate.ts               user_version runner, per-migration txn, VACUUM INTO pre-image
    src/db/migrations/001_init.ts   full schema DDL + singleton rows
    src/db/statements.ts            every prepared statement, prepared once at boot
    src/db/flush.ts                 the one write path: IMMEDIATE txn over world+dirty+events+stats
    src/db/boot.ts                  cold load into World, repair pass, tail-ring hydrate
    src/db/repair.ts                quick_check, fk_check, zombie/orphan fixes, denormalised recount
    src/db/retention.ts             severity-tiered bounded deletes, snapshot prune, ledger rollup
    src/net/http.ts                 hand-rolled router over node:http, ETag, JSON error envelope
    src/net/routes/*.ts             state, floors, teams, feed, stream
    src/net/sse/hub.ts              client registry, single-buffer broadcast, backpressure, resync
    src/net/sse/ring.ts             600-frame circular buffer of encoded frames, keyed by seq
    src/net/admin.ts                loopback :8788, timingSafeEqual token guard
    src/ops/shutdown.ts             ordered SIGTERM drain: flush, checkpoint, bye, close
    src/ops/health.ts               /healthz, /readyz, /metrics
    test/invariants.ts              the 22 named invariant predicates
    test/soak.test.ts               100k-tick headless run, bands over the 30k-100k window
    test/determinism.test.ts        double-run digest equality, snapshot replay, domain isolation
  apps/web/
    svelte.config.js                adapter-node; alias $shared
    vite.config.ts                  Tailwind v4 plugin, ssr.noExternal workspace pkgs, /api dev proxy
    src/app.css                     @import tailwindcss + the @theme token block + @utility + base
    src/routes/+layout.svelte       shell, store+connection provider, skip links, ARIA regions
    src/routes/+page.server.ts      SSR /api/v1/bootstrap with 1500ms timeout + empty fallback
    src/routes/+page.svelte         the dashboard grid
    src/routes/text/+page.svelte    non-canvas text-equivalent dashboard (skip-link target)
    src/routes/api/[...path]/+server.ts  prod reverse proxy, streams SSE through untouched
    src/lib/state/store.svelte.ts   SimStore class: $state fields, SvelteMap, RingBuffer, MotionBuffer
    src/lib/state/applyFrame.ts     THE single writer; op switch with a default that forces resync
    src/lib/state/ring.ts           fixed-capacity circular buffer with a $state revision counter
    src/lib/state/motion.ts         non-reactive SoA typed arrays: legs, glyph, colorIndex, hp, flags
    src/lib/net/sse.ts              dependency-free SSE line parser over ReadableStream
    src/lib/net/connection.svelte.ts  lifecycle, ?since cursor, backoff, watchdog, visibility suspend
    src/lib/live/clock.ts           rate-adjusted playback clock, renders DELAY_TICKS behind
    src/lib/map/renderer.ts         rAF loop, layered draw, idle short-circuit, frame stats
    src/lib/map/camera.ts           world<->screen, cursor-anchored zoom, clamped pan
    src/lib/map/terrainCache.ts     per-floor OffscreenCanvas raster at 24px/tile, LRU 3
    src/lib/map/fog.ts              explored bitset + viewport mask, rebuilt on tile crossing
    src/lib/map/hit.ts              O(1) picking via tile buckets + room index
    src/lib/design/tokens.ts        typed hex mirror of @theme for the canvas (asserted by test)
    src/lib/design/teams.ts         TEAM_COLORS, monograms, shapes; teamColor(colorIndex)
    src/lib/design/terrain.ts       canvas terrain palette + fog alpha constants
    src/lib/design/events.ts        EventType -> {token, icon, priority, tickerTreatment}
    src/lib/design/motion.ts        duration/easing constants + prefersReducedMotion
    src/lib/components/*.svelte     StatCard, TeamCard, LeaderboardRow, EventTicker(+Item),
                                    MapPanel, FloorSelector, KeeperStatusPanel, HeroMemorial,
                                    ConnectionBanner, InspectorPopover, NumberTicker, EmptyState
  deploy/
    donjon-sim.service              systemd unit, LimitNOFILE=65535, ProtectSystem=strict
    donjon-web.service              systemd unit for adapter-node SSR on 127.0.0.1:3000
    Caddyfile                       TLS/HTTP2; /api/* -> :8787 with flush_interval -1
```

## Data model

Migration 001. STRICT tables, `journal_mode=WAL`, `synchronous=FULL`, `auto_vacuum=INCREMENTAL`, `foreign_keys=ON`. **All money is integer copper (`_cp`). All rates are integer basis points (`_bp`). No REAL column holds money or a rate, and no arithmetic on money happens in SQL.**

```sql
CREATE TABLE world (
  id INTEGER PRIMARY KEY CHECK (id=1),
  seed INTEGER NOT NULL, lineage_id TEXT NOT NULL,
  tick INTEGER NOT NULL DEFAULT 0,
  last_flush_ms INTEGER NOT NULL, dormancy_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('running','paused','shutdown_clean')),
  sim_version TEXT NOT NULL, flavour_hash TEXT NOT NULL, tuning_hash TEXT NOT NULL,
  boot_count INTEGER NOT NULL DEFAULT 0, unclean_boots INTEGER NOT NULL DEFAULT 0,
  initial_coin_cp INTEGER NOT NULL, minted_cp INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE dungeon (
  id INTEGER PRIMARY KEY CHECK (id=1),
  treasury_cp INTEGER NOT NULL, loan_cp INTEGER NOT NULL DEFAULT 0,
  austerity INTEGER NOT NULL DEFAULT 0 CHECK (austerity IN (0,1)),
  aggression_milli INTEGER NOT NULL DEFAULT 1000,
  lethality_ema_milli INTEGER NOT NULL DEFAULT 220,
  revenue_ema_cp INTEGER NOT NULL DEFAULT 0,
  fame_milli INTEGER NOT NULL DEFAULT 0, notoriety_milli INTEGER NOT NULL DEFAULT 0,
  entry_fee_cp INTEGER NOT NULL DEFAULT 500, toll_bp INTEGER NOT NULL DEFAULT 1500,
  corpse_tax_bp INTEGER NOT NULL DEFAULT 8500,
  keeper_mood TEXT NOT NULL CHECK (keeper_mood IN ('content','greedy','panicked','bankrupt')),
  decree_id TEXT, decree_expires_tick INTEGER,
  heroes_slain INTEGER NOT NULL DEFAULT 0, corpse_yield_cp INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE floors (
  id INTEGER PRIMARY KEY, depth INTEGER NOT NULL UNIQUE, seed INTEGER NOT NULL,
  name TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
  room_count INTEGER NOT NULL, entry_room INTEGER NOT NULL, stairs_room INTEGER NOT NULL,
  danger_cr_milli INTEGER NOT NULL, generated_tick INTEGER NOT NULL,
  tiles BLOB NOT NULL, next_hop BLOB NOT NULL, dist BLOB NOT NULL
) STRICT;

CREATE TABLE rooms (
  id INTEGER PRIMARY KEY, floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL,
  kind TEXT NOT NULL, archetype_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('stocked','cleared','restocking')),
  loot_cp INTEGER NOT NULL DEFAULT 0, trap_id INTEGER,
  trap_state TEXT NOT NULL DEFAULT 'none' CHECK (trap_state IN ('none','armed','sprung','disarmed')),
  restock_due_tick INTEGER, visits INTEGER NOT NULL DEFAULT 0, deaths INTEGER NOT NULL DEFAULT 0,
  UNIQUE (floor_id, idx)
) STRICT;
CREATE TABLE room_links (
  floor_id INTEGER NOT NULL, from_room INTEGER NOT NULL, to_room INTEGER NOT NULL,
  kind TEXT NOT NULL, cost INTEGER NOT NULL DEFAULT 1, path BLOB NOT NULL,
  PRIMARY KEY (from_room, to_room)
) STRICT, WITHOUT ROWID;

CREATE TABLE teams (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, motto TEXT NOT NULL,
  color_index INTEGER NOT NULL CHECK (color_index BETWEEN 0 AND 9),
  monogram TEXT NOT NULL, voice_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('recruiting','delving','fighting','fleeing','resting','disbanded')),
  floor_id INTEGER REFERENCES floors(id), room_id INTEGER REFERENCES rooms(id),
  tile_x INTEGER NOT NULL DEFAULT 0, tile_y INTEGER NOT NULL DEFAULT 0,
  gold_cp INTEGER NOT NULL DEFAULT 0, carried_cp INTEGER NOT NULL DEFAULT 0,
  rations INTEGER NOT NULL DEFAULT 0, morale INTEGER NOT NULL DEFAULT 70,
  renown_milli INTEGER NOT NULL DEFAULT 0, rank INTEGER NOT NULL DEFAULT 0,
  peak_renown_milli INTEGER NOT NULL DEFAULT 0, deepest_floor INTEGER NOT NULL DEFAULT 0,
  last_action TEXT, commit_until_tick INTEGER NOT NULL DEFAULT 0,
  recent_template_ids TEXT NOT NULL DEFAULT '[]',
  formed_tick INTEGER NOT NULL, disbanded_tick INTEGER
) STRICT;
CREATE INDEX ix_teams_live ON teams(state) WHERE disbanded_tick IS NULL;

CREATE TABLE heroes (
  id INTEGER PRIMARY KEY, team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL UNIQUE, species TEXT NOT NULL, class TEXT NOT NULL,
  epithet_id TEXT, level INTEGER NOT NULL DEFAULT 1, xp INTEGER NOT NULL DEFAULT 0,
  hp INTEGER NOT NULL, hp_max INTEGER NOT NULL,
  str INTEGER NOT NULL, agi INTEGER NOT NULL, con INTEGER NOT NULL,
  wil INTEGER NOT NULL, per INTEGER NOT NULL,
  greed_milli INTEGER NOT NULL, cowardice_milli INTEGER NOT NULL,
  gold_cp INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK (state IN ('tavern','active','downed','wounded','dead','retired')),
  bleed_out_tick INTEGER, kills INTEGER NOT NULL DEFAULT 0, delves INTEGER NOT NULL DEFAULT 0,
  born_tick INTEGER NOT NULL, died_tick INTEGER, died_wall_ms INTEGER,
  death_floor INTEGER, death_room_name TEXT, killer_kind TEXT, killer_name TEXT,
  gold_taxed_cp INTEGER
) STRICT;
CREATE INDEX ix_heroes_team ON heroes(team_id) WHERE team_id IS NOT NULL;

-- durable per-hero counters; the ONLY source for earned epithets. Never derived from events.
CREATE TABLE hero_counters (
  hero_id INTEGER NOT NULL REFERENCES heroes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hero_id, kind)
) STRICT, WITHOUT ROWID;

CREATE TABLE monsters (
  id INTEGER PRIMARY KEY, def_id TEXT NOT NULL, name TEXT NOT NULL,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL, floor_id INTEGER,
  cr_milli INTEGER NOT NULL, hp INTEGER NOT NULL, hp_max INTEGER NOT NULL,
  atk INTEGER NOT NULL, def INTEGER NOT NULL, dr INTEGER NOT NULL,
  dmg_count INTEGER NOT NULL, dmg_sides INTEGER NOT NULL,
  is_guardian INTEGER NOT NULL DEFAULT 0, wage_cp_per_day INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK (state IN ('alive','dead','respawning')),
  respawn_due_tick INTEGER, hero_kills INTEGER NOT NULL DEFAULT 0, died_tick INTEGER
) STRICT;
CREATE INDEX ix_monsters_room ON monsters(room_id) WHERE state='alive';

CREATE TABLE items (
  id INTEGER PRIMARY KEY, def_id TEXT NOT NULL, name TEXT NOT NULL,
  slot TEXT NOT NULL, rarity INTEGER NOT NULL, value_cp INTEGER NOT NULL,
  atk_bonus INTEGER NOT NULL DEFAULT 0, def_bonus INTEGER NOT NULL DEFAULT 0,
  dr INTEGER NOT NULL DEFAULT 0,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('hero','team','room','dungeon','void')),
  owner_id INTEGER, created_tick INTEGER NOT NULL, destroyed_tick INTEGER
) STRICT;
CREATE INDEX ix_items_owner ON items(owner_kind, owner_id) WHERE destroyed_tick IS NULL;

-- No foreign keys, by design: heroes/monsters/items get pruned, the feed must outlive them.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tick INTEGER NOT NULL, wall_ms INTEGER NOT NULL,
  type TEXT NOT NULL, severity INTEGER NOT NULL CHECK (severity BETWEEN 0 AND 3),
  floor_id INTEGER, room_id INTEGER, team_id INTEGER, hero_id INTEGER, monster_id INTEGER,
  x INTEGER, y INTEGER, gold_delta_cp INTEGER NOT NULL DEFAULT 0,
  tpl TEXT NOT NULL, slots TEXT NOT NULL DEFAULT '{}', flavour_hash TEXT NOT NULL
) STRICT;
CREATE INDEX ix_events_sev  ON events(severity, id);
CREATE INDEX ix_events_team ON events(team_id, id) WHERE team_id IS NOT NULL;

CREATE TABLE ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tick INTEGER NOT NULL,
  from_account TEXT NOT NULL, to_account TEXT NOT NULL,
  amount_cp INTEGER NOT NULL, reason TEXT NOT NULL
) STRICT;
CREATE TABLE ledger_daily (
  day INTEGER NOT NULL, reason TEXT NOT NULL,
  amount_cp INTEGER NOT NULL, entries INTEGER NOT NULL,
  PRIMARY KEY (day, reason)
) STRICT, WITHOUT ROWID;

CREATE TABLE team_stats (
  team_id INTEGER PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  monster_kills INTEGER NOT NULL DEFAULT 0, hero_deaths INTEGER NOT NULL DEFAULT 0,
  gold_banked_cp INTEGER NOT NULL DEFAULT 0, rooms_explored INTEGER NOT NULL DEFAULT 0,
  traps_sprung INTEGER NOT NULL DEFAULT 0, delves INTEGER NOT NULL DEFAULT 0,
  wipes INTEGER NOT NULL DEFAULT 0, deepest_floor INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE hall_of_fame (
  hero_id INTEGER PRIMARY KEY, name TEXT NOT NULL, epithet TEXT,
  species TEXT NOT NULL, class TEXT NOT NULL, level INTEGER NOT NULL,
  team_id INTEGER, team_name TEXT NOT NULL,
  died_tick INTEGER NOT NULL, died_wall_ms INTEGER NOT NULL,
  floor_depth INTEGER NOT NULL, room_name TEXT NOT NULL,
  killer_kind TEXT NOT NULL, killer_name TEXT NOT NULL,
  gold_carried_cp INTEGER NOT NULL, gold_taxed_cp INTEGER NOT NULL,
  monster_kills INTEGER NOT NULL, ticks_lived INTEGER NOT NULL,
  epitaph_tpl TEXT NOT NULL, epitaph_slots TEXT NOT NULL DEFAULT '{}',
  notability INTEGER NOT NULL, counters TEXT NOT NULL DEFAULT '{}'
) STRICT;
CREATE INDEX ix_hof_recent ON hall_of_fame(died_tick DESC);
CREATE INDEX ix_hof_notability ON hall_of_fame(notability DESC);

CREATE TABLE snapshots (tick INTEGER PRIMARY KEY, digest TEXT NOT NULL, blob BLOB NOT NULL) STRICT;
CREATE TABLE scheduler (seq INTEGER PRIMARY KEY, due_tick INTEGER NOT NULL,
  kind TEXT NOT NULL, entity_id INTEGER NOT NULL, payload INTEGER NOT NULL) STRICT;
CREATE INDEX ix_scheduler_due ON scheduler(due_tick);
```

### Shared TypeScript contract (`packages/shared` — the only wire contract; imported by sim and web)

```ts
// tick.ts
export const TICK_MS = 1000;
export const DAY_TICKS = 3600;              // 1 in-world day = 1 real hour
export const TICKS_PER_FRAME = 2;           // 500 ms broadcast cadence
export const FLUSH_EVERY = 30;
export const RETENTION_EVERY = 600;
export const SNAPSHOT_EVERY = 3600;
export const HOURS = (h: number) => Math.round((h * 3_600_000) / TICK_MS);
export const RETAIN = { sev0: HOURS(6), sev1: HOURS(48), sev2: HOURS(720) } as const;

// events.ts — 28 types. ONE source of truth.
export const EVENT_TYPES = [
  'WORLD_INIT','DUNGEON_DORMANCY','KEEPER_DECREE','KHAN_LOAN','RECORD_SET',
  'TEAM_FORMED','TEAM_DISBANDED','TEAM_WIPE','RECRUIT','HERO_SPAWNED','HERO_LEVEL_UP',
  'HERO_DOWN','HERO_DEATH','HERO_EPITHET_GAINED','HERO_RETIRED',
  'PARTY_ENTERED','PARTY_EXITED','EXPLORED','ROOM_CLEARED','FLOOR_DESCEND','FLOOR_ASCEND',
  'COMBAT_START','COMBAT_ROUND','COMBAT_END','MONSTER_DOWN',
  'TRAP_SPRUNG','TRAP_DISARMED','LOOT_FOUND','REST',
  'ENTRY_FEE_PAID','TOLL_PAID','CORPSE_TAX_LEVIED','GUARDIAN_HIRED','WAGE_PAID',
] as const;
export type EventType = typeof EVENT_TYPES[number];
export type Severity = 0 | 1 | 2 | 3;       // 0 chatter, 1 routine, 2 notable, 3 historic
export const SEVERITY: Record<EventType, Severity> = { /* static, exhaustive */ } as const;

export interface EventDTO {
  id: number; tick: number; wallMs: number; type: EventType; severity: Severity;
  floorId: number | null; roomId: number | null; teamId: number | null; heroId: number | null;
  x: number | null; y: number | null; goldDeltaCp: number;
  tpl: string; slots: Record<string, string | number>;
}

// protocol.ts
export const PROTOCOL_VERSION = 1;
/** [x0,y0,x1,y1,startTick,endTick] — ABSOLUTE ticks, so a dropped frame never desyncs motion */
export type MoveLeg = [number, number, number, number, number, number];

export interface TokenPublic {
  id: number; kind: 'team' | 'guardian'; refId: number; floorId: number;
  x: number; y: number; legs: MoveLeg[];
  hp: number;             // 0..1, drives the HP arc
  glyph: number;          // index into the icon table
  colorIndex: number;     // 0..9, index into TEAM_COLORS — assigned once at TEAM_FORMED
  monogram: string; flags: number;   // bit0 alive, bit1 fighting, bit2 fleeing, bit3 looting
}
export interface TeamPublic {
  id: number; name: string; motto: string; colorIndex: number; monogram: string;
  status: 'recruiting'|'delving'|'fighting'|'fleeing'|'resting'|'disbanded';
  floorId: number | null; roomName: string | null;
  members: { id: number; name: string; species: string; klass: string;
             hp: number; hpMax: number; alive: boolean; level: number }[];
  hpCp: number; hpMaxCp: number; morale: number;
  goldCp: number; carriedCp: number; lootItems: number; bestItem: string | null;
  rank: number; renownMilli: number; deepestFloor: number; kills: number; deaths: number;
}
export interface KeeperPublic {
  treasuryCp: number; loanCp: number; austerity: boolean;
  mood: 'content'|'greedy'|'panicked'|'bankrupt';
  guardiansAlive: number; guardianSlots: number; wageBillCpPerDay: number;
  trapsArmed: number; entryFeeCp: number; corpseTaxBp: number;
  decree: { id: string; text: string; expiresTick: number } | null;
  revenueTodayCp: number; costsTodayCp: number; heroesSlain: number;
}
export interface FloorIndexEntry {
  id: number; depth: number; name: string; w: number; h: number; generation: number;
  roomCount: number; teamCount: number; corpseCount: number; discovered: boolean;
}
export interface SnapshotDTO {
  v: number; seq: number; tick: number; ts: number; dt: number;      // dt = ms per tick, live
  speed: number; paused: boolean; epoch: number;
  keeper: KeeperPublic; teams: TeamPublic[]; tokens: TokenPublic[];
  floors: FloorIndexEntry[]; leaderboard: LeaderRow[];
  recentEvents: EventDTO[];                                          // last 60, oldest first
  counters: { heroesFallen: number; heroesAlive: number; teamsActive: number;
              goldLootedCp: number; goldRecoveredCp: number; deepestFloor: number };
  casualtySeries: number[];   // 288 buckets, 5 in-world min each
  casualtyBucket: number;     // current head index
}
/** Every op is ABSOLUTE and idempotent. Re-applying a frame is a no-op. */
export type Op =
  | { o:'mv';    id:number; f:number; legs:MoveLeg[] }
  | { o:'warp';  id:number; f:number; x:number; y:number; tick:number }
  | { o:'tok+';  t:TokenPublic }
  | { o:'tok-';  id:number; why:'exit'|'death' }
  | { o:'team';  id:number; p:Partial<TeamPublic> }
  | { o:'team+'; t:TeamPublic }
  | { o:'keeper';p:Partial<KeeperPublic> }
  | { o:'floor'; id:number; p:Partial<FloorIndexEntry> }
  | { o:'floor+';f:FloorIndexEntry }
  | { o:'room';  id:number; f:number; state:string; trapState:string }
  | { o:'ev';    e:EventDTO }
  | { o:'cnt';   p:Partial<SnapshotDTO['counters']> }
  | { o:'cas';   total:number; bucket:number; value:number }         // absolute, not a delta
  | { o:'lb';    rows:LeaderRow[] };
export interface Frame {
  v:number; seq:number; tick:number; from:number; ts:number; dt:number;
  speed:number; paused:boolean; epoch:number; ops:Op[];
}
export interface LeaderRow {
  rank:number; prevRank:number|null; teamId:number; name:string;
  colorIndex:number; monogram:string; renownMilli:number;
  goldBankedCp:number; heroesLost:number; deepestFloor:number; alive:boolean;
}
```

## Simulation design

**Tick.** `TICK_MS = 1000`, drift-corrected `setTimeout` (never `setInterval`), absolute `nextAt`. One tick = one tile of movement = one combat round. `DAY_TICKS = 3600` (an in-world day per real hour), split into three watches of 1200 ticks: `POTRON_MINET`, `ZENITH`, `CREPUSCULE`. Catch-up is clamped at 4 ticks; beyond that the loop resyncs and records `ticks_dropped`. **There is no boot catch-up**: on restart the world resumes at `world.tick` and `dormancy_ms` records the wall-clock gap. Boot cost is O(1).

**PRNG.** sfc32 (4×uint32 state, no rotl emulation), seeded derivationally — never a persisted stream:
`streamSeed(worldSeed, tick, domain, entityId, seq)` → 4 mix32 hashes, `d |= 1`, 12 warm-up rounds. `RngDomain` is an append-only integer enum (FLOORGEN=1 … FLAVOUR_SELECT=24, FLAVOUR_FILL=25); values are never renumbered or reused, enforced by a test against a checked-in frozen snapshot of the enum. Adding domain 26 provably cannot perturb domains 1–25 — asserted directly by `determinism.test.ts`.

**Determinism rules (enforced).** Entity iteration is over id-sorted arrays only; every `.sort()` ends `|| a.id - b.id`; no `Date`/`Math.random`/`performance.now` in `src/engine/**` (lint + bundle grep); every persisted numeric is an integer, soft quantities in `_milli`, money in `_cp`; utility scores are quantised `Math.round(x * 1e6)` before comparison with an enum-ordinal tiebreak; `worldDigest()` serializes in a fixed field order into a byte buffer hashed with SHA-256, never `JSON.stringify`.

**Team state machine.** `RECRUITING → DELVING|DISBANDED`; `DELVING → FIGHTING|RESTING|FLEEING|RECRUITING|DISBANDED`; `FIGHTING → DELVING|FLEEING|RESTING|DISBANDED`; `FLEEING → DELVING|RESTING|RECRUITING|DISBANDED`; `RESTING → DELVING|FIGHTING|FLEEING|DISBANDED`; `DISBANDED` terminal. Illegal transitions throw in dev, log + clamp in prod. Disband when living roster < 2, or `gold_cp < 0` for 3 in-world days, or mean morale < 12 for 1800 ticks.

**Combat.** `statMod(x)=floor((x-10)/2)`. `ATK = 6 + floor(lvl*0.6) + statMod(primary) + item.atk`; `DEF = 6 + floor(lvl*0.4) + statMod(AGI) + item.def`; `DR = min(6, Σitem.dr)`; `hitDC = clamp(2,19, 8 + DEF_t - ATK_a)`; hit on `d20 >= hitDC` → 65% at parity. Crit on nat 20 or `d20 >= 20 - critBonus`: damage dice ×2, DR ignored. Nat 1 = fumble, 10% `OFF_BALANCE` (−2 ATK, 2 ticks). `damage = max(1, roll(dmgCount d dmgSides) + statMod(primary) + floor(lvl/3) - DR)`. Initiative: `AGI + d6` desc, tie by id asc, one shared order. Monster targeting: `w = 1.0 × (hpFrac<0.35 ? 1.6:1) × (topDamagerLastRound ? 1.3:1) × (DEF>=14 ? 0.6:1)`, with a 15% flat-random "the guardian is confused" roll. Monster scaling from CR `c`: `HP=8+7c`, `ATK=6+1.2c`, `DEF=7+c`, `DR=floor(c/3)`, `dmg=1d(4+2·min(c,6))+floor(c/2)`, `xp=10c^1.4`, `wage_cp_per_day=35c^1.25`.

**Downed & permadeath.** `hp<=0` → DOWNED, `bleed_out_tick = tick + 8`. One ally may attempt STABILIZE per tick: `p = clamp(0.10,0.90, 0.45 + 0.05·statMod(WIL) + (isPretre?0.15:0) + 0.02·lvl)`. At bleed-out: `p_perma = clamp(0.15,0.98, 0.25 + 0.05·overkill + 0.30·abandoned + 0.20·wiped − 0.20·stabilized)`. Survivor → WOUNDED, hp 1, trait `scarred`, 20% permanent −1 to a random stat, team morale −15. Dead → `CORPSE_SWEEP` wake at +60 ticks: dungeon collects `hero.gold_cp + 0.6·Σitem.value_cp` (integer floor, remainder to `SINK_ROUNDING`), the other 40% burns to `SINK_ROT`, and `gold_taxed_cp` is written onto the hero row for the memorial.

**Loot & the money faucet.** Rarity weights at depth `f`: COMMON 100, UNCOMMON `22+3f`, RARE `4+1.6f`, EPIC `0.5+0.5f`, LEGENDARY `f>=5 ? 0.02f^1.5 : 0`. `value_cp = round(base[rarity] · (0.75+0.5·rng) · (1+0.08f))`, base `[40,220,1100,6000,30000]`. Every loot placement is a **purchase by the dungeon**: `transfer(TREASURY, ITEMS, value·f)` plus `mint(value·(1−f))` where

```
COIN_SETPOINT = 1_500_000 cp
restockCostFactor(C) = clamp(0.35, 2.00, (C / COIN_SETPOINT) ** 0.8)
C = circulating coin = Σhero.gold + Σteam.gold+carried + treasury   (excludes items in world)
```

f(setpoint) = 1.0 **exactly**, so the fixed point is the setpoint. f(1.0M) = 0.72 (28% mint), f(2.4M) = 1.46 (46% burn). Symmetric authority in both directions. This is the world's only faucet outside the Khan loan.

**Homeostasis — target steady state,** asserted over ticks 30k–100k of the soak:

| Quantity | Target band |
|---|---|
| Active teams | 4–8 (hard cap 10) |
| Living heroes | 25–50 (hard floor 1, soft floor 20) |
| Tavern pool | 6–20 |
| Hero deaths / in-world day | 2–5 |
| Delves / in-world day | 6–14 |
| Lethality (delves with ≥1 death) | 0.18–0.30 |
| Treasury | 40k–400k cp |
| Circulating coin | 0.9M–2.4M cp |
| Mean living hero level | 3.5–6.5 |
| Deepest floor reached | strictly increases at least once per 200k ticks |

**L1 population (negative).** `pNewHero = clamp(0, 0.25, 0.0020·(40 − livingHeroes) + 0.030·fameNorm − 0.015·notorietyNorm)`, gated on `poolSize < 20` and an `ARRIVAL_COOLDOWN` wake of `rng.int(60,300)` ticks. **Below 20 living heroes the cooldown is bypassed entirely** (`p = 0.25`, cooldown 0) and a `KEEPER_DECREE` marketing campaign fires. `pFormTeam = clamp(0, 0.05, 0.006·(7 − activeTeams))` gated on `poolSize >= 4 && activeTeams < 10`.

**L2 difficulty (negative — and it is the Keeper's business logic).** `lethalityEma = 0.995·prev + 0.005·delveHadDeath` per completed delve; `revenueEma = 0.99·prev + 0.01·dailyCorpseYield`. `aggression += 0.015·(revenueTarget − revenueEma)/revenueTarget − 0.020·(lethalityEma − 0.22)`, clamped `[0.55, 1.75]`, `revenueTarget = 9000 cp/in-world day`. Aggression multiplies monsters-per-room and CR **at restock time only** — a stocked room never changes under a team standing in it.

**L3 money (negative).** `restockCostFactor` above, plus sinks: Khan tax on banked loot `clamp(200,3500, 1000 + (C − 1.5M)·4e-5)` bp; hero upkeep 300 cp/hero/in-world day; tavern healing 40 cp/HP; gear purchase at `priceIndex = clamp(0.6,2.5,(C/1.5M)^0.5)`; guardian wages daily; trap rearm `25·tier^1.5`; `SINK_ROT` 40% of corpse item value; loan interest 12%/in-world day.

**L4 fame vs notoriety (positive, bounded).** `fame += 400·log10(1+extractedCp/100) + 80·newDeepest`, `×0.999` per 30 ticks. `notoriety += 900` per permadeath, `×0.9988` per 30 ticks. Both saturate through `x/(x+k)`, so loop gain stays below 1.

**L5 the Khan loan — bounded, with repayment.** If `treasury_cp < 5000` **and** `loan_cp == 0`: `loan_cp = 25000`, mint into treasury, emit `KHAN_LOAN`. If `treasury_cp < 5000` and a loan is already outstanding, enter **austerity** instead: `austerity = 1`, aggression clamped to 1.75, `restockPolicy()` returns guardian rooms only, guardian wages withheld (which drives loyalty down and produces its own narrative). Every tick: `if (treasury_cp > 60000 && loan_cp > 0) { pay = min(loan_cp, floor(treasury_cp * 0.25)); transfer(TREASURY, SINK_KHAN, pay); loan_cp -= pay; if (loan_cp === 0) austerity = 0; }`. Invariant: `loan_cp <= 25000`, and `loan_cp === 0` at least once per 50k ticks.

**Team AI — six-action argmax with hysteresis.** Context per team per tick: `hpFrac`, `worstHpFrac`, `morale`, `greed`, `rationsFrac`, `depth`, `distToExit`, `carryFull`, `downed`, `threatRatio`, `lvlGap = meanLevel − (1 + 1.3·(depth))`, `unclearedFrac = unclearedRooms/roomCount`, `ticksSinceNewDeepest`.

```
U_EXPLORE = 35 + 40·hpFrac + 0.30·morale − 25·(1−rationsFrac) + 10·greed − 30·(downed>0)
            − 45·(1 − unclearedFrac)                       ← floor-exhaustion pressure
U_DESCEND = 20 + 45·hpFrac·(morale/100) + 8·lvlGap + 15·greed − 30·(1−rationsFrac)
            − 25·carryFull − 40·(downed>0)
            + 20·min(1, ticksSinceNewDeepest / 36000)      ← boredom pressure (10 in-world days)
U_LOOT    = 15 + 55·greed + 20·log10(1 + roomLootCp/100) − 100·inCombat
U_REST    = 5 + 90·(1−hpFrac)^1.5 + 0.5·(60−morale) + 30·roomSafe − 60·(rations<=0) − 80·inCombat
U_RETREAT = 10 + 70·(1−hpFrac) + 0.6·(50−morale) + 0.02·sqrt(carriedCp) + 25·downed − 0.8·distToExit
U_FLEE    = inCombat ? 30 + 90·(1−hpFrac) + 1.2·(45−morale) + 40·max(0,threatRatio−1) : −1e6
```
Commitment bonus `+12e6` to `last_action` while `tick < commit_until_tick` (EXPLORE 6, DESCEND 6, LOOT 2, REST 20, RETREAT 30, FLEE 0). Emergency override `+60e6` to RETREAT/FLEE when `worstHpFrac < 0.15 || downed > 0`, bypassing commitment. The exhaustion and boredom terms together are what stop the world locking at floors 5–6.

**XP.** `xpToNext(L) = round(80·L^1.65)`, MAX_LEVEL 20. Award = `Σmonster.xp · clamp(0.2,2.0,1.5^(meanCR − meanLevel)) · 0.5^(teamRoomClearsLast_DAY_TICKS) / livingRoster`. **Anti-farm decay is per `(team, room)`, not per room** — a new team can still level on shallow floors while veterans cannot, which keeps the level ladder alive as the population turns over.

**Pathfinding.** Floors are static after generation: 18–30 rooms, ~1.4× edges, `buildApsp` runs n BFS at gen time (~50 µs) into a `uint8` next-hop matrix. Movement per team per tick is one array read `next[from*n + to]`. Room-to-room polylines are precomputed into `room_links.path` and drive one tile of movement per tick; the sim never thinks in tiles beyond emitting the current tile coordinate.

**Ranking.** Integer fixed point, no floats, no SQL. Renown accrues: room cleared `+8·depth`, monster killed `+3·CR^1.2`, guardian `+120·CR^0.8`, first-ever to reach floor d `+40d`, new personal deepest `+15d`, loot banked `+12·log10(1+cp/100)`, successful extraction `+25·floorsDescended`, trap disarmed `+4·tier`, permadeath `−60`, wipe `−250`, fled `−15` (all ×1000 into `_milli`). Decay every 30 ticks: `renown_milli = floor(renown_milli * 9985 / 10000)` → half-life 13,860 ticks ≈ 3.85 in-world days. Ordering is computed in `ranking.ts` only and written to `teams.rank`:
```
ORDER BY renown_milli DESC, deepest_floor DESC, gold_banked_cp DESC, id ASC
```
Disbanded teams keep decaying to zero, then move to the Hall of the Fallen ordered by `peak_renown_milli`.

## Content packs

**Format.** Hand-authored JSON under `packages/content/packs/core/`, validated by zod, compiled by `npm run content:build` into `dist/pack.<hash>.json` + generated `.d.ts`. Cross-references (loot tables, pools, item ids, room tags) must resolve or the build fails with a file + JSON-pointer. Templates are parsed to ASTs and `when` predicates compiled to closures at build time.

**Two hashes, deliberately split:**
- `flavourHash` — templates, lexicon, names, epithets, voices, room/monster/item flavour. Pinned onto every event row; a change forks the replay lineage.
- `tuningHash` — `economy.json`, `weights.json`, spawn weights. Recorded on the world row, **not** part of the replay-refusal check. This is what makes a day of balance tuning possible without forking the world 60 times. `DONJON_CONTENT_WATCH` defaults on in `NODE_ENV=development`.

**Engine signature (pure, no I/O, no DB writes):**
```ts
export function narrate(input: {
  eventType: EventType; eventId: number; worldSeed: number; tick: number;
  env: SlotEnv; voice: VoiceId; watch: Watch;
  recentTemplateIds: readonly string[];      // from teams.recent_template_ids, 24 entries
  pack: LoadedPack;
}): { tpl: string; slots: Record<string, string | number>; toneTags: ToneTag[] };

export function narrateStateless(i: Omit<Parameters<typeof narrate>[0], 'recentTemplateIds'>): ...;
```
Two RNG forks and only two: `rngFor(seed, tick, RngDomain.FLAVOUR_SELECT, eventId)` picks the skeleton, `rngFor(seed, tick, RngDomain.FLAVOUR_FILL, eventId)` fills slots. Adding lexicon words never changes which skeleton was chosen. The AST walk is depth-first in source order, consuming the fill stream only when a random choice is actually required; alternation and optional-block decisions are made *before* descending, and skipped branches consume nothing (asserted by a test that counts `u32()` calls).

**Template DSL** (grammar in `docs/template-dsl.md`, with a 40-case parser fixture): `{slot}` / `{slot.path}` entity slots; `{@poolId}` / `{@poolId#tag}` lexicon draws; `{x|filter|filter:arg}` filter chains (`indef, the, s, poss, cap, num, ord, coin, past, prog, 3sg, pron`); `<a|b|c>` uniform and `<3:a|1:b>` weighted inline alternation; `[ … ]?p` optional blocks scaled by `voice.verbosity`. Selection filters by `requires`/`when`/`voices`/`era`, applies `w = weight × rarityMul × watchToneMul × (inRecent ? 0.05 : 1)`, and falls back to each type's mandatory `*.fallback.00` template rather than throwing. Post-processing collapses whitespace, fixes `a/an`, ensures one terminal punctuation mark, capitalises.

**Storage decision: `(tpl, slots)`, never rendered prose.** The event row stores the template id and the slot values; rendering happens in the API projection layer and in the browser using the same `renderTemplate`. This makes retention free, makes the wire payload ~60 B instead of ~90 B, keeps the DB ~10× smaller, and unlocks the FR/EN toggle later at zero server cost. A golden test asserts server- and client-rendered strings are byte-identical over 2,000 seeded fixtures.

**Event taxonomy.** 28 types (listed in the shared contract above), with `SEVERITY` a static exhaustive `Record<EventType, 0|1|2|3>` in `packages/shared`. The DB CHECK is generated from that type, so a severity value can never violate it.

- **`MOVE` does not exist as an event.** Tile movement is carried by the `mv` frame op and the `teams` row only — no template, no row, no narration. The ticker shows a synthetic `EXPLORED` aggregate (one row per team per 10 s window). This removes 34% of event volume, the hardest repetition case, and ~2.6 MB/day of pointless prose.
- Severity assignment: 0 = `COMBAT_ROUND`, `EXPLORED`, `REST`, `TOLL_PAID`; 1 = `LOOT_FOUND`, `TRAP_SPRUNG`, `MONSTER_DOWN`, `COMBAT_START/END`, `ENTRY_FEE_PAID`, `WAGE_PAID`, `RECRUIT`; 2 = `HERO_DOWN`, `ROOM_CLEARED`, `FLOOR_DESCEND`, `HERO_LEVEL_UP`, `GUARDIAN_HIRED`, `CORPSE_TAX_LEVIED`, `PARTY_EXITED`, `TRAP_DISARMED`, `HERO_EPITHET_GAINED`; 3 = `HERO_DEATH`, `TEAM_WIPE`, `TEAM_FORMED`, `KEEPER_DECREE`, `KHAN_LOAN`, `RECORD_SET`, `WORLD_INIT`, `DUNGEON_DORMANCY`.

**Authoring volume for v1** (deliberately a fraction of the original budget — these are the numbers a 5-floor dungeon actually consumes):

| File | v1 count | ~lines | PRs |
|---|---|---|---|
| `species.json` | 10 | 180 | 1 |
| `classes.json` | 6 | 130 | 1 |
| `names/*.json` | 10 files | 400 | 1 |
| `monsters.json` | 24 | 550 | 1 |
| `items.json` | 40 | 380 | 1 |
| `rooms.json` | 15 | 220 | 1 |
| `traps.json` | 12 | 140 | 1 |
| `lexicon.json` (verbs) | 8 pools, 120 verbs | 850 | 1 |
| `lexicon.json` (pools) | ~900 strings | 500 | 1 |
| `epithets.json` | 24, over 6 counted kinds | 90 | ½ |
| `team-names.json`, `voices.json` | 4 patterns, 4 voices | 200 | ½ |
| `economy.json` | fees, tax bp, wages, 6 decrees, 12 slogans | 160 | ½ |
| `templates/*.json` | ~400 across 27 types | 4,400 | **4 PRs of 100 templates** |

Template budget per type: `T = clamp(ceil(0.3·sqrt(dailyOccurrences)·salience), 5, 40)`, with salience weighted toward the events people actually read — `HERO_DEATH` 30, `TEAM_WIPE` 20, `KEEPER_DECREE` 18, `BOSS`/`RECORD_SET` 12, `COMBAT_ROUND` 18, `LOOT_FOUND` 16, everything else 5–12. Anti-repetition rests on five multipliers, of which skeleton count is the *least* efficient: lexicon depth, inline alternation, optional blocks, per-team voice gating, and the watch tone-weight vector (`slapstick` ×1.6 at ZENITH, `grim`/`melancholy` ×1.7–1.8 at CREPUSCULE, `epic_parody` ×1.4 at POTRON_MINET).

## Server & streaming contract

**Routes** (base `/api/v1`, all `application/json`, errors `{error:{code,message}}`):

| Method | Path | Cache | Source |
|---|---|---|---|
| GET | `/bootstrap` | no-store | memory — `{server, world, floors, snapshot, cursor, streamUrl}` |
| GET | `/state` | no-store | memory — same buffer the SSE `snapshot` carries |
| GET | `/floors` | max-age=60 | memory |
| GET | `/floors/:id/map` | `immutable, max-age=31536000` + ETag | memory, cached per `(id, generation)` |
| GET | `/teams`, `/teams/:id`, `/heroes/:id` | no-store | memory |
| GET | `/memorial?limit=&beforeId=` | no-store | SQLite, index-covered |
| GET | `/events?beforeId=&teamId=&limit<=200` | no-store | SQLite, keyset, global 120 qps token bucket |
| GET | `/stream` | no-store | SSE |
| GET | `/healthz`, `/readyz`, `/metrics` | no-store | — |

Admin on a **separate** `http.Server` bound to `127.0.0.1:8788`: `POST /admin/{pause,resume,step,speed,checkpoint,loglevel}`, `GET /admin/diag`. Guard = loopback `remoteAddress` **and** absent `x-forwarded-for` **and** `timingSafeEqual` on `x-donjon-admin-token`. Every admin action logs at info with the full body.

**Frame format & snapshot/delta protocol.**

```
Content-Type: text/event-stream; charset=utf-8
Cache-Control: no-cache, no-transform
X-Accel-Buffering: no

retry: 2000
: donjon-sim v0.1 tick=182304

event: snapshot
id: 91228
data: {"v":1,"seq":91228,"tick":182304,...}

event: frame
id: 91229
data: {"v":1,"seq":91229,"tick":182306,"from":182304,"ts":...,"dt":1000,"ops":[...]}
```

Five rules that make this correct rather than merely plausible:

1. **Snapshots are only ever produced at frame boundaries.** After encoding frame N, the hub caches `(seq: N, buffer: projector.snapshotBuffer(world))`. Every joiner and every resync gets that pair. A snapshot is never projected at an arbitrary mid-window tick, so the next delta can never re-deliver ops the snapshot already contains.
2. **Every op is absolute and idempotent.** `cas` carries `{total, bucket, value}`, not a delta. `team`/`keeper`/`floor` are sparse `Object.assign` patches (last-write-wins). `applyFrame` drops any `ev` whose `e.id <= sim.conn.maxEventId`. Re-applying a frame is a no-op by construction.
3. **A seq is never silently skipped.** If a client's `res.writableLength` exceeds `slowClientBytes` (512 KiB), the hub marks it `needsResync`, stops sending deltas, and writes one snapshot frame whose `seq` is current — so the client's gap check is satisfied by construction rather than by a fetch that would amplify traffic 33×. Above `killClientBytes` (4 MiB) or 30 s stalled, the client is evicted with `event: bye`.
4. **Ops within a frame have a fixed phase order,** unit-tested: spawns (`tok+`/`team+`/`floor+`) → patches (`team`/`keeper`/`floor`/`room`) → movement (`mv`/`warp`) → events (`ev`) → aggregates (`cnt`/`cas`/`lb`) → despawns (`tok-`). A team that spawns and moves in the same window cannot lose its first move.
5. **No server-side stream filters in v1.** The whole world is ~1.2 KB/frame; one shared buffer serves everyone, and there is no way for a filtered client to receive an unfiltered ring replay.

**Movement.** `{o:'mv', id, f, legs}` where each leg is `[x0,y0,x1,y1,t0,t1]` in **absolute ticks**, ≤4 legs per frame; beyond 4 the server emits `warp` instead. `dt` and `speed` are in *every* frame, not just bootstrap.

**Batching.** `TICKS_PER_FRAME = max(1, round(500 / (TICK_MS / speed)))` — the wall-clock frame rate is pinned at 2 Hz regardless of sim speed. Empty frames (`ops: []`, ~90 B) still ship: they carry `ts`/`tick`/`dt` and keep the client clock synced. Broadcast runs in `setImmediate` off the tick, chunked 250 clients per turn, and is measured as its own `donjon_broadcast_ms` histogram separate from `donjon_tick_cpu_ms`. Heartbeat `: hb` every 10 s (an SSE comment — no `id:`, so it cannot corrupt the cursor). **While paused,** one frame fires on the transition and then only heartbeats, so a long debugging pause cannot burn the ring.

**Reconnect.** The client sends `?since=<seq>` (never `Last-Event-ID` — it uses `fetch`+`ReadableStream`, not `EventSource`). Ring capacity 600 frames = 5 minutes. Within the ring: one `Buffer.concat` of the gap, written once, no snapshot. Outside it, or on `epoch` mismatch (sim restarted): `event: snapshot`. Resync on the client is a **merge, not a reset** — teams reconciled by id (add/patch/delete), MotionBuffer slots returned to the free list for absent ids, and `ticker` + `casualtySeries` preserved.

**Persistence cadence.** Flush every 30 ticks at `tick % 30 === 1` (offset so the fsync never sits between engine work and the broadcast). One `tx.immediate()` over world + dirty rows + event batch + ledger + `team_stats` + `hero_counters`. `EventBuffer` is split into two structures: `pendingFlush: PendingEvent[]` (cleared by the flusher, hard-capped, pauses the sim rather than dropping silently) and `tailRing: RingBuffer<EventDTO>(500)` (never drained, hydrated on boot, the sole source for `recentEvents`). `wal_checkpoint(PASSIVE)` hourly on the hot loop; `TRUNCATE` only during shutdown.

## Frontend architecture

**Routes.** `/` (dashboard), `/text` (non-canvas equivalent, skip-link target), `/teams/[id]`, `/leaderboard`, `/memorial`, `/keeper`, `/events`, `/api/[...path]` (prod reverse proxy). Deep-linkable view state lives in the query string (`/?floor=3&team=7`); floor changes use `replaceState`, team selection `pushState`.

**Store shape.** Created by a factory + `setContext` under a `Symbol` key — **never** module-level `$state`, which would be shared across concurrent SSR requests. `SimStore` holds: `meta`, `conn`, `keeper` (`$state`), `teams` (`SvelteMap`), `floors` (`SvelteMap`), `leaderboard` (`$state.raw`, replaced wholesale), `casualties` + `casualtySeries: Float32Array(288)`, `ticker: RingBuffer<EventDTO>(200)`, `selection`, `view`, and two **non-reactive** members the canvas owns: `motion: MotionBuffer` (SoA typed arrays) and `topo`/`explored` (plain `Map`, LRU 5). The layout shell reads connection state only; entity state is read exclusively by leaf panels, so entity churn never invalidates the shell.

`applyFrame` is the single writer, with a `default:` arm that logs the unknown op and returns `'gap'` — an unknown op forces a resync rather than producing a silently-wrong world.

**Canvas renderer strategy.** Three layers, and the render loop never reads reactive state:
- **L0 terrain** — one `OffscreenCanvas(1440×960)` per floor rasterised once at `CACHE_TILE = 24` (60×40 tiles), 16-case wall bitmask shapes, deterministic 4-step floor dither, LRU 3 with `canvas.width = 0` on eviction. ~6 ms, rare.
- **L1 fog** — viewport-sized mask, `destination-out` radial punches per team light over an explored bitset sized `ceil(W*H/8)` (derived, never hardcoded). Rebuilt only on tile-boundary crossing, `explored` change, or camera move (~10 Hz), blitted otherwise (~0.5 ms).
- **L2 dynamic** — ~40 sprites read straight from `MotionBuffer` typed arrays. Token anatomy: 2px ink ring → team-colour disc → HP arc → **Lucide/monogram glyph drawn with `fillText` in Atkinson** → alive pips → 2-char monogram at `zoom >= 1.0`. No emoji atlas, no spritesheet.

Budget at 1200×760, DPR capped at 2: terrain blit 0.6 ms + fog blit 0.5 + fog rebuild amortised 0.2 + discs/arcs 0.5 + glyphs 1.0 + labels 0.35 ≈ **3.2 ms**, ~5× headroom. Hard rules: no `shadowBlur` ever; no `save()`/`restore()` in the entity loop; batch by fillStyle; zero allocation in `draw()` (pooled floating text, LRU-capped gradient and `measureText` caches); viewport culling; LOD by zoom; idle short-circuit when nothing is interpolating and nothing changed.

**Interpolation.** Server-authoritative, client never predicts. A rate-adjusted playback clock renders `DELAY_TICKS = TICKS_PER_FRAME` behind server time, so the next leg has always already arrived:
```ts
const err = targetTick - playback;
rate = clamp(1 + err * 0.15, 0.9, 1.1);      // ±10% time-scale nudge, imperceptible
playback += (elapsed / dt) * rate;
if (playback > targetTick + 0.5) playback = targetTick + 0.5;   // never run past known data
```
Position comes from the leg whose `[t0,t1)` contains `playback`, eased `easeInOutQuad`. Hard snap on `|err| > 12` ticks (tab wake, resync) and on every `warp` op. Under reduced motion `dur = 0` and tokens render at exact tile centres.

**Memory guardrails.** Every container is bounded *by construction*: ticker `RingBuffer(200)` rendering 60 DOM nodes (hard truncation, not virtualisation — keeps `role="log"`, find-in-page and text selection working); casualty series a preallocated `Float32Array(288)`; leaderboard 50 rows via `$state.raw`; MotionBuffer 256 slots with a free list fed by `tok-` **and** by resync reconciliation; terrain LRU 3 with explicit `width = 0`; gradient cache 32; `measureText` cache 128; frame stats `Float32Array(240)`. Event text is rendered once at push time onto the event object, never rebuilt in a `$derived`. One `AbortController` per connection; one global 1 s clock interval for the whole app; all observers disconnected on teardown. On `visibilitychange → hidden` the stream is aborted and `seq` remembered; on visible it reconnects with `?since=`.

## Design system

### Tailwind v4 `@theme` token block (`apps/web/src/app.css`)

```css
@import "tailwindcss";
@import "./lib/design/fonts.css";

@theme {
  /* ============ INK ============ */
  --color-ink-900: #14110D;
  --color-ink-800: #1F1A15;
  --color-ink-700: #2A241C;

  /* ============ STONE (warm dungeon neutrals) ============ */
  --color-stone-50:  #F7F2E9;   --color-stone-100: #EDE4D5;
  --color-stone-200: #D9CCB6;   --color-stone-300: #BFAE92;
  --color-stone-400: #9E8E73;   --color-stone-500: #786A54;
  --color-stone-600: #5F5445;   --color-stone-700: #474035;
  --color-stone-800: #332D26;   --color-stone-900: #211D18;
  --color-stone-950: #12100D;

  /* ============ PARCHMENT ============ */
  --color-parchment-50:  #FEFAF0;  --color-parchment-100: #FBF3DE;
  --color-parchment-200: #F5E7C2;  --color-parchment-300: #EBD59B;
  --color-parchment-400: #DCBC6D;  --color-parchment-500: #C9A04A;
  --color-parchment-600: #AC813A;  --color-parchment-700: #86632E;
  --color-parchment-800: #5E4724;  --color-parchment-900: #3D2E18;

  /* ============ TORCH AMBER (sole chrome accent) ============ */
  --color-torch-100: #FFE9BF;  --color-torch-200: #FFD68A;
  --color-torch-300: #FFBE4D;  --color-torch-400: #FCA31E;
  --color-torch-500: #EE8A05;  --color-torch-700: #A34F0A;

  /* ============ BLOOD RED (danger, deaths) ============ */
  --color-blood-100: #FDD3CE;  --color-blood-300: #F27A6C;
  --color-blood-400: #E64F3E;  --color-blood-500: #D0301F;
  --color-blood-700: #871B14;

  /* ============ POISON GREEN (success, gains) ============ */
  --color-poison-100: #DCF5C0; --color-poison-300: #99DA57;
  --color-poison-400: #7BC432; --color-poison-700: #396717;

  /* ============ ARCANE VIOLET (magic, rare events) ============ */
  --color-arcane-300: #B892F1; --color-arcane-400: #9C6BE7;
  --color-arcane-700: #542D8E;

  /* ============ RANK METALS ============ */
  --color-rank-gold: #F2C230; --color-rank-silver: #C6CBD4; --color-rank-bronze: #C0763C;

  /* ============ SEMANTIC ALIASES ============ */
  --color-surface:          var(--color-stone-950);
  --color-surface-raised:   var(--color-stone-900);
  --color-panel:            var(--color-parchment-100);
  --color-panel-raised:     var(--color-parchment-50);
  --color-panel-sunken:     var(--color-parchment-200);
  --color-ink:              var(--color-ink-900);
  --color-ink-muted:        var(--color-stone-700);
  --color-on-surface:       var(--color-parchment-100);
  --color-on-surface-muted: var(--color-stone-300);
  --color-accent:           var(--color-torch-400);
  --color-accent-on-panel:  var(--color-torch-700);
  --color-danger:           var(--color-blood-400);
  --color-danger-on-panel:  var(--color-blood-700);
  --color-success:          var(--color-poison-400);
  --color-success-on-panel: var(--color-poison-700);
  --color-keeper:           var(--color-arcane-400);
  --color-border-ink:  var(--color-ink-900);
  --color-rule:        rgba(20, 17, 13, 0.14);
  --color-focus:       var(--color-torch-300);
  --color-scrim:       rgba(11, 9, 8, 0.72);

  /* ============ TEAM TOKENS (10, CVD-optimised — see table) ============ */
  --color-team-vermilion: #DE4F11;  --color-team-brass:     #C5B204;
  --color-team-bile:      #BDFC18;  --color-team-moss:      #5FEF91;
  --color-team-verdigris: #73F6D5;  --color-team-glacier:   #33F7FC;
  --color-team-azure:     #3DC2FC;  --color-team-arcane:    #8D6EFE;
  --color-team-mauve:     #A46AA9;  --color-team-rose:      #F384BD;

  /* ============ CANVAS TERRAIN ============ */
  --color-map-unexplored: #0B0908;  --color-map-wall-ink:  #050403;
  --color-map-wall:       #1F1A15;  --color-map-floor:     #332D26;
  --color-map-floor-alt:  #3A332B;  --color-map-rubble:    #4A4234;
  --color-map-hazard:     #2B4F5C;  --color-map-trap:      #A32E22;
  --color-map-door:       #8E7466;  --color-map-stairs:    #A99C86;

  /* ============ TYPE FAMILIES ============ */
  --font-display: "Lilita One", "Trebuchet MS", ui-sans-serif, system-ui, sans-serif;
  --font-sans:    "Atkinson Hyperlegible Next", "Atkinson Hyperlegible",
                  ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-mono:    "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* ============ TYPE SCALE ============ */
  --text-display-lg: 2.5rem;   --text-display-lg--line-height: 1.05;
  --text-display-lg--letter-spacing: 0.012em; --text-display-lg--font-weight: 400;
  --text-display-md: 1.75rem;  --text-display-md--line-height: 1.1;
  --text-display-md--letter-spacing: 0.015em; --text-display-md--font-weight: 400;
  --text-display-sm: 1.25rem;  --text-display-sm--line-height: 1.15;
  --text-display-sm--letter-spacing: 0.02em;  --text-display-sm--font-weight: 400;
  --text-title:   1.125rem;    --text-title--line-height: 1.3;   --text-title--font-weight: 700;
  --text-body:    0.9375rem;   --text-body--line-height: 1.55;   --text-body--font-weight: 400;
  --text-body-sm: 0.875rem;    --text-body-sm--line-height: 1.5;
  --text-table:   0.8125rem;   --text-table--line-height: 1.35;
  --text-label:   0.75rem;     --text-label--line-height: 1.25;
  --text-label--letter-spacing: 0.08em;       --text-label--font-weight: 700;
  --text-micro:   0.6875rem;   --text-micro--line-height: 1.2;
  --text-micro--letter-spacing: 0.06em;       --text-micro--font-weight: 600;
  --text-stat-xl: 2rem;        --text-stat-xl--line-height: 1;
  --text-stat-xl--letter-spacing: -0.02em;    --text-stat-xl--font-weight: 600;
  --text-stat:    1.25rem;     --text-stat--line-height: 1.1;    --text-stat--font-weight: 600;
  --text-num:     0.875rem;    --text-num--line-height: 1.4;     --text-num--font-weight: 500;

  /* ============ SPACING / RADII ============ */
  --spacing: 0.25rem;
  --radius-xs: 2px; --radius-sm: 3px; --radius-md: 5px;
  --radius-lg: 8px; --radius-xl: 12px; --radius-token: 9999px;

  /* ============ HARD INK SHADOWS (zero blur — the elevation primitive) ============ */
  --shadow-ink-sm: 2px 2px 0 0 var(--color-ink-900);
  --shadow-ink:    3px 3px 0 0 var(--color-ink-900);
  --shadow-ink-lg: 5px 5px 0 0 var(--color-ink-900);
  --shadow-lift:   6px 6px 0 0 var(--color-ink-900);

  /* ============ MOTION ============ */
  --ease-token:  cubic-bezier(0.4, 0, 0.2, 1);
  --ease-enter:  cubic-bezier(0, 0, 0.2, 1);
  --ease-settle: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-rank:   cubic-bezier(0.2, 0.8, 0.2, 1);

  /* ============ BORDER WIDTHS + Z SCALE (consumed via @utility / z-(--z-*)) ============ */
  --border-hair: 1px; --border-ink: 2px; --border-heavy: 3px;
  --z-map-floor: 0; --z-map-token: 20; --z-panel: 40; --z-sticky: 50;
  --z-hud: 60; --z-dropdown: 70; --z-modal: 80; --z-toast: 90; --z-tooltip: 100;
}

@utility ink      { border-width: var(--border-ink);  border-color: var(--color-border-ink); border-style: solid; }
@utility ink-hair { border-width: var(--border-hair); border-color: var(--color-rule);       border-style: solid; }

@layer base {
  html { background-color: var(--color-surface); color-scheme: dark; }
  body { background-color: var(--color-surface); color: var(--color-on-surface);
         font-family: var(--font-sans); font-size: var(--text-body); line-height: 1.55;
         -webkit-font-smoothing: antialiased; }
  :focus-visible { outline: 2px solid var(--color-ink-900); outline-offset: 0;
                   box-shadow: 0 0 0 4px var(--color-focus); border-radius: var(--radius-sm); }
  table, .tabular { font-variant-numeric: tabular-nums lining-nums; }
}
```

**Art direction.** Dark dungeon-stone shell (`#12100D`) with parchment panels laid on top — the dungeon is the world, the UI is the Keeper's paperwork about it. Four signatures: (1) 2px black ink contour on every panel, chip, button and map token, uniform weight, never 1px; (2) hard offset ink shadow `3px 3px 0 0`, **zero blur** — blur is the fastest way to look like a generic dashboard; (3) torch amber is the only chrome accent, one warm light source; (4) money and body counts set in mono on ruled parchment, like a ledger, because that is the joke. Banned: gradients on surfaces, backdrop blur, soft shadows, neon glow, cool-grey neutrals, hover scale/lift. **Single fixed theme** — no light mode, no `prefers-color-scheme` branch; the parchment panels already are the light reading surface, and all body copy sits on them at 15–17:1.

**Fonts — self-hosted via Fontsource, no CDN, no external requests.**

| Role | Family | Package | Weights |
|---|---|---|---|
| Display / team names / headings (uppercase, ≥20px only) | Lilita One (OFL) | `@fontsource/lilita-one` | 400 |
| UI text, dense tables, event ticker | Atkinson Hyperlegible Next (OFL, Braille Institute) | `@fontsource-variable/atkinson-hyperlegible-next` | variable 200–800 |
| All numbers: gold, corpses, ranks, timestamps | IBM Plex Mono (OFL) | `@fontsource/ibm-plex-mono` | 400, 500, 600 |

`fonts.css` imports the `latin` subsets only. `+layout.svelte` emits `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the three blocking files, resolved through Vite `?url` so the hashed path is right. Metric-matched `@font-face` fallbacks (`size-adjust: 107%`, `ascent-override: 92%`) suppress CLS. **Icons: Lucide (`@lucide/svelte`, ISC)**, 24×24 stroke-1.75, recoloured via `currentColor` so every icon inherits a semantic token — plus a 6-glyph hand-drawn sprite on the same grid (duck, dragon, coin-purse, keeper-monocle, guardian-halberd, tombstone). **No emoji anywhere in the product.**

**Component inventory.**

| Component | Purpose | Key classes | States implemented |
|---|---|---|---|
| `StatCard` | one headline number + delta + optional sparkline | `flex flex-col gap-0.5 rounded-md border border-ink/10 bg-panel px-3 py-2 min-w-[132px]` | default, hover*, focus, selected, loading, stale |
| `TeamCard` | roster entry: crest, name, rank, avatars, HP + morale bars, loot chips | `rounded-md border border-ink/12 bg-panel px-3 py-2.5 transition-colors duration-150` | all 8 incl. **dead** (grayscale, `line-through decoration-danger`, sinks to list bottom) |
| `LeaderboardRow` | ranked row, medals 1–3, FLIP reorder, rank-delta arrow | `grid grid-cols-[28px_1fr_32px_72px_88px_44px] items-center gap-2 h-10 px-2` | default, hover, focus, selected, loading, dead, stale |
| `EventTickerItem` | one narrated line: time, icon, entity chips | `grid grid-cols-[58px_20px_1fr] items-baseline gap-2 px-2 h-7 text-[13px]` | 4 priority tiers, hover, focus, loading, stale |
| `EventTicker` | reversed list, pause-on-hover, filter chips, 250 ms buffered flush | `role="log" aria-live="off"` + separate digest region | paused, empty, stale |
| `MapPanel` | canvas host + toolbar + legend + statusbar | `relative flex-1 min-h-0 bg-surface`, canvas `absolute inset-0 touch-none` | default, hover-tile, focus, followed, loading, empty-floor, stale |
| `FloorSelector` | vertical depth strip w/ occupancy + corpse dots | `flex flex-col w-11 border-r border-ink/10 bg-panel/40` | roving tabindex, active, undiscovered=disabled |
| `KeeperStatusPanel` | treasury, staffing gauge, loan/austerity, mood pill, decree | `PANEL` + 3 gauges `h-2 rounded-full bg-ink/10` | default, loading, **bankrupt**, stale |
| `HeroMemorial` | fallen counter + tombstone entries | `flex flex-col gap-0.5 border-b border-ink/8 px-3 py-2 text-[12px]` | default, recent-fade (30 s), empty, stale |
| `ConnectionBanner` | live / reconnecting / stale / offline pill + countdown + retry | `inline-flex items-center gap-1.5 rounded-full border px-2.5 h-7` | 4 states, `role="status"` |
| `InspectorPopover` | anchored detail for team/room/monster/hero | `z-(--z-tooltip) w-72 rounded-lg ink bg-panel shadow-ink` | hover-open (250 ms dwell), click-pinned (focus-trapped), loading, dead-target |
| `NumberTicker` | digit odometer, direction flash, freeze on stale | `inline-flex font-mono tabular-nums` | default, loading, frozen, reduced-motion |
| `EmptyState` | shared zero-data surface, in-world copy | `flex flex-col items-center justify-center gap-2 py-8 px-4 text-center` | neutral, danger |

*Hover only under `@media (hover:hover)`, and hover **never** changes size or position — the map is already moving.

**Cross-component state contract.** `default` → `hover` (+18% border contrast, +6% bg tint) → `focus-visible` (2px ink outline + 4px torch ring, inset for list rows) → `selected` (`border-accent bg-accent/8 ring-1 ring-accent/40`, mirrored on the map token) → `disabled` (`opacity-45 pointer-events-none aria-disabled`) → `loading` (grey blocks at exact final geometry, never spinners, only after 120 ms) → `dead` (grayscale, strikethrough, skull glyph, sorts to bottom, permanent, never animates again) → **`STALE`**, which is global: `<body class="is-stale">` driven by one `conn` store (never per-component `Date.now()` comparisons, lint-enforced) sets every border to `border-dashed`, freezes every `NumberTicker`, drops `transition-[width]` on all bars, hatches the map at 6% ink 45°, neutralises all rank arrows, disables live-only affordances, and fires **one** `aria-live="assertive"` announcement. Recovery runs one batched counter animation to truth and inserts a `— resumed —` ticker divider.

**Canvas terrain palette** (C\* ≤ 15 except revealed traps; minimum ΔE00 to any team token = **15.6**):

| Role | Hex | L\* | CR vs floor | ΔE to nearest token |
|---|---|---|---|---|
| unexplored / fog | `#0B0908` | 2.6 | 1.46 | 37.7 |
| wall ink (stroke) | `#050403` | 1.1 | 1.51 | 38.3 |
| wall fill | `#1F1A15` | 9.7 | 1.27 | 32.7 |
| **floor** | `#332D26` | 18.9 | 1.00 | 27.8 |
| floor alt (dither) | `#3A332B` | 21.7 | 1.09 | 26.2 |
| rubble | `#4A4234` | 28.4 | 1.37 | 21.4 |
| water / hazard | `#2B4F5C` | 31.5 | 1.54 | 19.3 |
| trap (revealed) | `#A32E22` | 37.6 | 1.92 | 15.7 |
| door | `#8E7466` | 50.9 | 3.13 | 16.8 |
| stairs | `#A99C86` | 64.9 | 5.04 | 15.6 |

Fog is not painted: unexplored is the background showing through; explored-but-not-visible renders at `globalAlpha = 0.45`. Locked doors are the door colour **plus an ink padlock glyph** — a distinct locked hue measured ΔE 3.8 from revealed traps under deuteranopia, an unfixable collision. Room hover is achromatic: `rgba(255,244,214,0.10)` overlay + a 2px marching-ants dash in `#FFD68A` (`stroke-dasharray: 6 4`, 600 ms loop), because every warm near-white stroke collided with light tokens under deuteranopic simulation. Traps and hazards additionally carry a 45° 3px hatch, so they are identifiable with no colour at all.

**The 10 verified team-token colours.** Derived by simulated annealing over a 42,167-candidate CIELCh pool with a 20° hue-spacing constraint, maximising worst-case CIEDE2000 across normal + deuteranopic + protanopic (Viénot 1999) simulation. **Global minimum ΔE00 across all 45 pairs × 3 vision models = 12.35.** Every token clears 3:1 against the canvas floor. These values are frozen constants in `src/lib/design/teams.ts` — the derivation code is *not* in the repo.

| # | Token | Hex | L\* | CR vs floor | Deuteranopic | Protanopic | Shape | Monogram |
|---|---|---|---|---|---|---|---|---|
| 0 | vermilion | `#DE4F11` | 53.1 | 3.39 | `#8E8E00` | `#6D6D16` | circle | `VM` |
| 1 | brass | `#C5B204` | 72.0 | 6.31 | `#B8B800` | `#B4B405` | diamond | `BR` |
| 2 | bile | `#BDFC18` | 91.9 | 11.08 | `#ECEC26` | `#F6F615` | square | `BI` |
| 3 | moss | `#5FEF91` | 85.1 | 9.22 | `#D2D295` | `#E4E490` | triangle-up | `MO` |
| 4 | verdigris | `#73F6D5` | 89.1 | 10.28 | `#DADAD7` | `#ECECD5` | hexagon | `VD` |
| 5 | glacier | `#33F7FC` | 89.0 | 10.27 | `#D5D5FE` | `#EBEBFC` | circle | `GL` |
| 6 | azure | `#3DC2FC` | 73.9 | 6.68 | `#A9A9FD` | `#B9B9FC` | diamond | `AZ` |
| 7 | arcane | `#8D6EFE` | 56.1 | 3.75 | `#7878FE` | `#7272FE` | square | `AR` |
| 8 | mauve | `#A46AA9` | 53.0 | 3.38 | `#7F7FA8` | `#7272A9` | triangle-down | `MV` |
| 9 | rose | `#F384BD` | 68.9 | 5.73 | `#AEAEBB` | `#9696BD` | hexagon | `RO` |

Shape cycles every five so shape and colour never correlate. **Colour is never the sole channel**: every token is disc + ink ring + inner keyline + shape + monogram, and the roster row carries the same monogram. `MAX_TEAMS = 10` exactly, so `colorIndex` is a stable slot allocated at `TEAM_FORMED`, persisted on `teams.color_index`, and read identically by the canvas and the DOM. Minimum token render size is 14px; below that the monogram drops and the legend is required. Guardians are keeper-violet on a hexagon base, outside the 10.

**Dashboard wireframe (desktop ≥1280px).**

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ TOPBAR h-14  ⛨ DONJON │ FALLEN 1 284 ▲7 │ GOLD 84 210 │ TEAMS 7/10 │ DEEPEST F-6 │ ● LIVE    │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────┬───────────────────────────────────────────────────┬───────────────────────┐
│ ROSTER  336px    │ MAP  minmax(560px,1fr)                            │ RAIL  360px           │
│ ┌──────────────┐ │ ┌───────────────────────────────────────────────┐ │ ┌───────────────────┐ │
│ │ ⚔ Teams  7   │ │ │ TOOLBAR h-10 [Follow ▾][labels][fog][grid] ⓘ  │ │ │ LEADERBOARD flex-1│ │
│ └──────────────┘ │ ├───┬───────────────────────────────────────┬───┤ │ │ ①  Duck Squad  ▲2 │ │
│ ┌──────────────┐ │ │ F │                                       │ L │ │ │ ②  Marvin & Co ▬  │ │
│ │ ● Duck Squad │ │ │ L │   <canvas> 60×40 tiles, 24px cache    │ E │ │ │ ③  Bone Cartel ▼1 │ │
│ │   4 hero F-3 │ │ │ O │   ● team tokens  ◆ guardians          │ G │ │ │ 4   Grand Khan ▲5 │ │
│ │ ●●●●○        │ │ │ O │   ▲ traps  ✦ loot  ✝ corpses          │ E │ │ ├───────────────────┤ │
│ │ HP  ▓▓▓▓▓▓░░ │ │ │ R │                                       │ N │ │ │ KEEPER STATUS     │ │
│ │ MOR ▓▓▓▓░░░░ │ │ │ 1 │                                       │ D │ │ │ TREASURY 12 940 ▲ │ │
│ │ 🪙2 410 ✦3   │ │ │ 2 │                                       │   │ │ │ STAFF  ▓▓▓▓▓▓░ 9/12│ │
│ └──────────────┘ │ │ 3►│                                       │   │ │ │ LOAN   ▓▓░░░ 18 200│ │
│ ┌──────────────┐ │ │ 4 │                                       │   │ │ │ MOOD   greedy      │ │
│ │ ● Bone Cartel│ │ │ 5 │                                       │   │ │ │ ⚑ DECREE tolls ×2  │ │
│ └──────────────┘ │ ├───┴───────────────────────────────────────┴───┤ │ ├───────────────────┤ │
│ ┌──────────────┐ │ │ STATUSBAR  F-3 "The Rat Exchange" ·  ⊖ 100% ⊕ │ │ │ MEMORIAL          │ │
│ │ ✝ The Ninth  │ │ └───────────────────────────────────────────────┘ │ │ 1 284 FALLEN      │ │
│ │   WIPED F-5  │ ├───────────────────────────────────────────────────┤ │ ✝ Ludo the Ferret │ │
│ └──────────────┘ │ TICKER  168px                                     │ │ ✝ Bref the Toad   │ │
│      ⋮ scroll    │ [all][combat][loot][deaths][keeper]    ⏸ paused   │ │ ✝ Ida the Mole    │ │
│                  │ 14:22:07 ☠ Ludo the Ferret died to a Rust Golem   │ │      ⋮ scroll     │ │
│                  │ 14:22:06 ◈ Duck Squad looted 340gp from a corpse  │ │                   │ │
│                  │ 14:22:05 ⚔ Bone Cartel engaged the guardian Grogro│ │                   │ │
└──────────────────┴───────────────────────────────────────────────────┴───────────────────────┘

.dash-grid { display:grid; height:100dvh; gap:.75rem; padding:.75rem;
  grid-template-columns: 336px minmax(560px,1fr) 360px;
  grid-template-rows: 3.5rem minmax(0,1fr) 168px;
  grid-template-areas: "topbar topbar topbar" "roster map rail" "roster ticker rail"; }
```
`minmax(0,1fr)` + `min-h-0`/`min-w-0` on children are load-bearing — without them the canvas's intrinsic size overflows the grid. Tablet (768–1279): `"topbar topbar" / "stats stats" / "map rail" / "ticker ticker"`, roster+leaderboard+keeper collapse into a 3-tab rail. Mobile (<768): single column, map sticky at 40dvh, a one-line latest-event strip showing the **highest-priority** event of the last 3 s (never merely the newest), then a 5-tab panel rail.

**Event type → colour token, icon, priority.** `P0` banner (pinned 8 s), `P1` emphasis (`border-l-2`), `P2` normal, `P3` chatter (off by default).

| Event | Token | Lucide icon | P |
|---|---|---|---|
| `EXPLORED` (synthetic, 10 s window) | `ink-muted` | `Footprints` | 3 |
| `COMBAT_START` | `accent` | `Swords` | 2 |
| `COMBAT_ROUND` | `ink-muted` | `Swords` @45% | 3 |
| `COMBAT_END` | `ink-muted` | `Swords` @45% | 3 (suppressed if the fight produced a death) |
| `MONSTER_DOWN` | `accent` | `Axe` | 2 |
| `HERO_DOWN` | `danger` | `HeartCrack` | 2 |
| `HERO_DEATH` | `danger` | `Skull` | 1 |
| `TEAM_WIPE` | `danger` | *skull-crossed (sprite)* | **0** |
| `TRAP_SPRUNG` | `danger` | `Zap` | 1 if lethal else 2 |
| `TRAP_DISARMED` | `success` | `Cog` | 2 |
| `LOOT_FOUND` | `rank-gold` | `Gem` | 2 |
| `REST` | `success` | `Tent` | 3 |
| `FLOOR_DESCEND` | `accent` | `ArrowDownToLine` | 1 |
| `FLOOR_ASCEND` | `accent` | `ArrowUpFromLine` | 2 |
| `ROOM_CLEARED` | `ink-muted` | `DoorOpen` | 2 |
| `PARTY_ENTERED` / `PARTY_EXITED` | `accent` | `LogIn` / `LogOut` | 2 |
| `TEAM_FORMED` | `success` | `UsersRound` | 1 |
| `TEAM_DISBANDED` | `ink-muted` | `UserMinus` | 2 |
| `RECRUIT` | `success` | `UserPlus` | 2 |
| `HERO_LEVEL_UP` | `accent` | `ChevronsUp` | 1 |
| `HERO_EPITHET_GAINED` | `arcane` | `Sparkles` | 1 |
| `HERO_RETIRED` | `ink-muted` | `DoorOpen` | 2 |
| `ENTRY_FEE_PAID` / `TOLL_PAID` | `keeper` | `Receipt` | 3 |
| `CORPSE_TAX_LEVIED` | `keeper` | `PackageOpen` | 2 |
| `WAGE_PAID` | `keeper` | `Coins` | 2 |
| `GUARDIAN_HIRED` | `keeper` | `Shield` | 2 |
| `KEEPER_DECREE` | `keeper` | `Scroll` | **0** + persistent decree strip |
| `KHAN_LOAN` | `danger` | `PiggyBank` | **0** |
| `RECORD_SET` | `rank-gold` | `Crown` | **0** |
| `DUNGEON_DORMANCY` | `ink-muted` | `Moon` | 1 |

Ticker filter chips: `all / combat / loot / deaths / keeper / chatter` (chatter off by default). Volume guard: buffered 250 ms flush; a flush adding >12 rows collapses same-type-same-team P2/P3 rows into one `×4` row. P0/P1 never collapse.

**Motion.** Named curves live in `@theme`; every duration is read from `motion.ts` so reduced-motion is one code path.

| What | Duration | Easing | Reduced-motion |
|---|---|---|---|
| Map token, tile→tile | leg `t1−t0` (1000 ms) | `easeInOutQuad` | snap; 300 ms trail dot |
| Camera pan (follow) | 400 ms | `--ease-settle` | instant |
| Zoom step | 160 ms | `--ease-token` | instant |
| Damage flash | 120 in / 240 out, max 1/token/s | linear / `--ease-enter` | static 2px danger ring, 600 ms |
| Death (token) | 400 ms desaturate + scale→0.86 | `--ease-settle` | instant greyscale |
| `TEAM_WIPE` map wash | 600 ms, once | `--ease-enter` | static fill 3 s |
| Ticker row entry | 180 ms opacity + `-6px` translate | `--ease-enter` | opacity only, 100 ms |
| P0 banner pin | 220 in / 8 s hold / 180 out | `--ease-enter` | opacity, 10 s hold |
| NumberTicker roll | 260 ms/digit, capped 900 ms, ≤4/s | `--ease-settle` | 0 ms + a `▲7` chip for 1500 ms |
| HP / morale bar width | 300 ms | `--ease-token` | 0 ms width, keep 150 ms colour |
| Leaderboard FLIP | 320 ms transform, skipped if >6 rows move | `--ease-rank` | no move; 1200 ms `bg-accent/15` highlight |
| Panel / tab crossfade | 160 ms opacity, **no slide** | `--ease-token` | 80 ms |
| Popover open | 120 ms | `--ease-enter` | 80 ms opacity |
| Stale hatch on/off | 200 ms | `--ease-token` | instant |

**Never animate:** marquee/auto-scrolling ticker text; idle camera drift or parallax; looping spinners for a live connection; layout-affecting properties (`height`, `top`, `margin`) on any repeating event; colour-cycling on the LIVE badge; hover scale/lift on cards; anything inside a `stale` panel. The single permitted infinite animation is the reconnecting dot ping.

**Accessibility.** Skip links (`/text`, `#map`, `#roster`, `#ticker`, `#leaderboard`) as the first focusable elements. Landmarks: `banner` / `nav aria-label="Teams"` / `main aria-label="Dungeon map"` / `aside` / `section aria-label="Event feed"`. Every long list uses **roving tabindex**, so the whole dashboard is ~15 tab stops regardless of team count. Global keys: `1–5` jump to panels, `f` follow, `[`/`]` floor, `p` pause ticker, `?` shortcuts, `Esc` clears selection then closes popovers.

The canvas is `tabindex=0 role="application"` with a keyboard reticle (arrows 1 tile, Shift 5 tiles) feeding a 150 ms-throttled polite region. Its `aria-label` is regenerated every 5 s ("Floor 3, 56×40, 12 rooms. 3 teams present: …"), and beneath it a `sr-only` `<table>` refreshed on the same cadence is the canonical non-visual map — reachable via a visible-on-focus "View map as a table" link, so no information requires entering the canvas.

**Live-region strategy** (the hard problem — up to 200 events/min):
- `#feed-log` — the visible list, `role="log" aria-live="off"`, arrow-key navigable, **never announced**.
- `#feed-digest` — `sr-only`, `aria-live="polite" aria-atomic="true"`, rewritten at most once per **5000 ms**, containing only P0/P1: *"3 events: Ludo the Ferret died on floor 3. Duck Squad descended to floor 4."* Beyond 4 qualifying events it degrades to a count. Because it is atomic and replaced wholesale, a backlog is impossible.
- `#alerts` — `aria-live="assertive"`, connection-state changes and `KHAN_LOAN`/bankruptcy only, max 1 per 10 s. **Nothing from the combat stream is ever assertive.**
- An explicit "Announce feed: off / notable / all" control, persisted, off by default.

Every bar is `role="progressbar"` with a text value; dead state carries strikethrough + skull + `aria-label`; rank deltas carry a text sign; all body text sits on parchment at ≥9:1 (`stone-500` moved to `#786A54` specifically to clear AA at 4.76); the two-tone focus ring's minimum effective contrast anywhere in the system is **8.24:1**; hit targets ≥32px desktop / ≥44px touch.

## Resolved critiques

| Problem (HIGH unless noted) | Resolution |
|---|---|
| Grand Khan loan is an unbounded mint loop with no repayment | Repayment phase in `dungeonTick`: 25% of treasury above 60k cp goes to principal. Hard cap of one outstanding loan; second bottom-out enters **austerity mode** (aggression clamped, guardian-rooms-only restock, wages withheld) instead of minting. Invariant: `loan_cp <= 25000` and `=== 0` at least once per 50k ticks. |
| `restockCostFactor` fixed point is at 5.28M, not the 2.5M setpoint; faucet 6.5× stronger than sink | `f(C) = clamp(0.35, 2.00, (C/1.5M)^0.8)`. f(setpoint) = 1.0 exactly; symmetric authority (28% mint at 1.0M, 46% burn at 2.4M). Measured on **circulating** coin, excluding items in unvisited rooms. |
| Nothing prunes `snapshots` — 3–31 GB/year | `retention.ts` keeps all snapshots for 14 in-world days, then one per in-world day for 90 days, then one per 30 days. Binary serialiser ships in the persistence phase, not deferred. Snapshot bytes reported on `/api/health`. |
| `ledger` has no retention; 1.6 GB/year | Two-tier: raw rows for 30 in-world days, rolled into `ledger_daily` from an in-memory accumulator at the day boundary, then bounded 5,000-row deletes. `LedgerReason` is one shared const — no second vocabulary. |
| Earned epithets computed from event rows that retention deletes | `hero_counters(hero_id, kind, n)` bumped inside the same `emit()`/flush transaction as the event. Only the 6 counted kinds referenced by `epithets.json` get rows (lint-enforced). Promoted into `hall_of_fame.counters` on death. |
| Team AI + per-room anti-farm decay self-locks the world at floors 5–6 forever | Three terms added: floor-exhaustion `−45·(1−unclearedFrac)` on EXPLORE; boredom `+20·min(1, ticksSinceNewDeepest/36000)` on DESCEND; anti-farm decay keyed per `(team, room)` not per room. Asserted: deepest floor strictly increases at least once per 200k ticks. |
| Four incompatible event-retention policies | One policy: the four-tier severity ladder (sev0 6 h, sev1 48 h, sev2 30 d, sev3 forever capped at 400k). Horizons derived from `TICK_MS` via `HOURS()`, never hardcoded tick literals. The content and engine retention rules are deleted. |
| `narrate()`'s ring buffer and `firedUnique` have no columns; `template_fired` written outside the flush txn | `teams.recent_template_ids TEXT` persisted in the dirty-set upsert. `unique` templates are **cut from v1** (deferred to v2 with era renewal), so `template_fired` and its out-of-transaction write do not exist. |
| Snapshot/delta race: snapshot projected mid-window but stamped with the last frame's seq → duplicate events, double-counted casualties | Snapshots are produced **only at frame boundaries** and cached with their seq. Every op is absolute and idempotent (`cas` carries `{total,bucket,value}`); `ev` deduped on `id <= maxEventId`. |
| Server drops frames for slow clients while the client treats a seq gap as a resync trigger → 33× traffic amplification loop | The hub never skips a seq. A congested client is marked `needsResync` and served one snapshot frame at the current seq; deltas resume only after. Client-side resync is rate-limited to one per 3 s with jitter. |
| Filtered clients replayed unfiltered ring frames → silent permanent divergence | Server-side stream filters removed from v1 entirely. `applyFrame` gains a `default:` arm that forces a resync on any unknown op. |
| Frontend chase-lerp cannot consume coalesced frames — every token exceeds the 1.8-tile clamp and snaps | Chase-lerp deleted. Absolute-tick `MoveLeg` is the only movement contract, with a rate-adjusted playback clock rendering `DELAY_TICKS` behind and an explicit `warp` op. `dt` ships in every frame. |
| Severity-4 event violates the DB CHECK, aborts the flush, pauses the world after 3 failures | Severity is `0|1|2|3` in one shared type; the CHECK is generated from it. Independently, `flush()` retries once with the event batch removed and quarantines offending rows rather than ever stopping the world. |
| `emit()` does synchronous I/O inside a package declared zero-I/O; breaks replay determinism | `emit()` is pure: assigns id, calls `narrate()`, appends to `world.pendingEvents` and `world.tailRing`. The host drains both. `loadPack` moved to `packages/content` and the parsed pack is injected into `World.genesis()`. |
| `EventBuffer` cannot be both flush queue and SSE tail | Split into `pendingFlush: PendingEvent[]` (cleared by the flusher, hard-capped) and `tailRing: RingBuffer(500)` (never drained, hydrated on boot). |
| Shared TS contract is aspirational — two DTO packages, no runtime validation | One `packages/shared`, imported by sim and web. Enforcement: `default:` arm in `applyFrame`; a `frames.golden.jsonl` fixture that `buildFrame` must produce and `applyFrame` must consume, in one shared vitest suite; `DONJON_VERIFY_DELTAS=1` dev mode diffing applied frames against a fresh projection every 100 ticks. |
| `wal_checkpoint(TRUNCATE)` blocks the event loop up to 5 s while the archive worker holds a read txn | Archive worker cut from v1. `PASSIVE` checkpoint on the hot loop, `TRUNCATE` only at shutdown; writer `busy_timeout` 50 ms and SQLITE_BUSY on checkpoint = skip and retry. |
| No end-to-end vertical slice — ~15k lines before a duck moves | Phase 1 is a three-PR walking skeleton (hardcoded floor, random walk, five tables, full-snapshot SSE, one canvas) ending with two tokens moving in a browser that survives a restart. Every later phase thickens that skeleton and ends in something visible. |
| Content PRs 7–10 are 3–5× over the 1000-line budget and unreviewable | Content data restated as ~14 PRs with per-file caps and one PR per big file; templates ship 100 per PR. v1 counts cut: monsters 70→24, items 180→40, rooms 45→15, traps 40→12, templates ~1,240→~400. |
| Repetition CI gate is mathematically unsatisfiable and will be red on landing | Threshold made a function of the type's template count: `maxSkeletonShare < max(0.04, 2.5/templateCount(type))`. The global 500-event identical-string gap is replaced by a per-`(type, team)` gap of 24 renders. Templates with zero Alt/Opt/PoolRef nodes are exempt. The test does not land until ≥300 templates exist. |
| Prose-vs-`{tpl,slots}` decided both ways by four areas | **`(tpl, slots)` wins.** No `events.text` column. Rendering happens in the API projection and the browser via the same function, byte-identity asserted by a golden test over 2,000 fixtures. |
| Four incompatible tick rates | `TICK_MS = 1000`, `DAY_TICKS = 3600`, in `packages/shared/tick.ts`. Every cadence, retention horizon, decay constant and interpolation duration is derived from it. No number in the codebase is expressed in seconds. |
| Three PRNGs; `world.rng_state` contradicts the derivational model | sfc32 + mix32 only, in `packages/shared/rng.ts`, used by sim **and** narrator (`FLAVOUR_SELECT`/`FLAVOUR_FILL` domains). `world.rng_state` deleted. |
| Six repo layouts, two package managers | npm workspaces: `apps/sim`, `apps/web`, `packages/shared`, `packages/content`. Every artifact path restated against it. |
| Four event taxonomies, integer `event_kinds` FK indirection | One 28-member `EVENT_TYPES` const in `packages/shared`; `events.type` is the string, indexed. The `event_kinds` table is deleted. |
| Money is `_cp` integer in one area and REAL gold with SQL `CAST` multiplies in another | Integer copper everywhere; every rate is an integer basis-point column; **no arithmetic on money in SQL** — `gold_taxed_cp` is computed by the sim and stored on the hero row. Truncation remainders go to `SINK_ROUNDING` so conservation is exact by construction. |
| Restart semantics specified three ways; catch-up floods the pipeline with 130k events | The world **pauses**. `missedTicks`, catch-up slicing and `MAX_CATCHUP` on boot are deleted. `dormancy_ms` records the gap and one `DUNGEON_DORMANCY` event is emitted. Boot is O(1). |
| Leaderboard ordered on a float `score` with an incomplete tiebreak → oscillating rank arrows | The SQL `score` expression is deleted. Rank is computed in `ranking.ts` from integer `renown_milli` with the full tiebreak chain ending `|| a.id − b.id`, written to `teams.rank` at the 30-tick decay pass. |
| `MAX_ITEMS_IN_WORLD` is an assertion with no behaviour on hitting it | Soft cap with eviction: above 3,600 items, `restockRoom` first destroys the lowest-value item in the deepest cleared room unvisited for 7 in-world days, crediting `SINK_ROT`. The 4,000 assertion becomes a consequence, not the mechanism. |
| MOVE gets the largest template budget and is never displayed (medium) | MOVE is not an event at all. No template file, no row, no narration; movement rides the `mv` frame op. 6 templates author the synthetic `EXPLORED` aggregate. |
| Content-hash-in-lineage forks the world on every tuning edit (medium) | Split into `flavourHash` (pinned per event, gates replay) and `tuningHash` (recorded, does not gate replay). Content watch defaults on in development. |
| No-comments rule leaves the append-only RNG enum, the DSL and the AST-walk contract undocumented (medium) | Encoded as named tests (`test('RngDomain values are append-only and never reused')`, `test('skipped alternation branches consume zero rng draws')`) plus `docs/template-dsl.md` and a 40-case parser fixture. Budgeted in the same PR as the thing they protect. |
| `livingHeroes ∈ [15,150]` is unrecoverable and spams violation events (medium) | Hard invariant relaxed to `>= 1`. Below 20 living heroes the arrival cooldown is bypassed and a marketing decree fires. `[25,50]` demoted to a soak-window band. Violation events rate-limited to one per invariant id per 5,000 ticks. |
| Broadcast charged against the tick budget (medium) | Broadcast moved to `setImmediate`, chunked 250 clients/turn, measured as its own metric. |
| Resync `resetStore` destroys ticker/series and leaks MotionBuffer slots (medium) | Resync is a merge: teams reconciled by id, MotionBuffer slots returned to the free list for absent ids, ticker and casualty series preserved, and the snapshot carries the full 288-bucket series. |
| `casualtySeries` and floor occupancy have no DTO source (medium) | Added to `SnapshotDTO` (`casualtySeries`, `casualtyBucket`) and `FloorIndexEntry` (`roomCount`, `teamCount`, `corpseCount`, `discovered`), with a `{o:'floor'}` op to keep them live. |
| `TokenPublic` lacks `hp`/`glyph`/hue; colour assigned three ways (medium) | `TokenPublic` carries `hp`, `glyph`, `colorIndex`, `monogram`, `flags`. `colorIndex` is allocated once at `TEAM_FORMED`, persisted, and read identically by canvas and DOM. The hash-based hue derivation is deleted. |
| Op ordering within a frame unspecified → same-window spawn+move drops the move (medium) | Fixed phase order in `buildFrame`, unit-tested with a spawn+move DirtySet fixture. |
| Retention mixes tick-space and wall-clock horizons; `died_at_ms` hardcodes 1000 ms/tick (medium) | `heroes.died_wall_ms` stored at death and selected directly. Every retention horizon is tick-space. Soak asserts wall/tick correspondence within 60 s of `created_at + tick·TICK_MS + dormancy`. |
| No bytes on the wire during boot catch-up → reconnect storm (medium) | No boot catch-up exists. N/A by construction. |
| `/api/v1/events` has only a per-IP limit (medium) | Global 120 qps token bucket, 503 + `Retry-After` above it, its own latency histogram. |
| Frames burn the ring during an admin pause (medium) | One frame on the pause transition, then heartbeat comments only (no `id:`), so the ring cannot advance. |
| SSR snapshot has no cursor → visible state wipe on hydrate (low) | `+page.server.ts` calls `/api/v1/bootstrap` and passes `{snapshot, cursor}`; the connection opens with `?since=<cursor>`. |
| `sqlite_version() >= 3.45` rejects working hosts (low) | Assert `>= 3.37` (when STRICT landed); the better-sqlite3 major pin lives in `package.json` where the lockfile enforces it. |
| Soak leak threshold 2 MB/h certifies a 45 MB/day leak; fast-forward can't catch wall-clock growth (low) | **Deferred to v2** — the soak harness is not in v1. What ships instead is `/metrics` heap + DOM-node gauges and a manual 24 h check (see Verification). Stated honestly: the automated frontend leak gate is deferred. |
| The 10-colour palette derivation, `color.ts`, `palette.test.ts`, the density system, the 8-state matrix as a formal artifact | Values kept, derivation deleted. `MAX_TEAMS = 10` makes the palette exactly sufficient. Density system **deferred to v2**; v1 ships one comfortable layout. |
| Post-endgame novelty: destiny objects, unique templates and cameos are consumed in 30–60 days, and `ERA_SHIFT` has no trigger | **Deferred to v2, honestly.** v1 has no eras, no destiny objects, no unique templates and no cameos. Its long-horizon memory mechanism is `hero_counters` → earned epithets → `hall_of_fame`, plus `RECORD_SET`. Era renewal (regenerate floors below 3, rotate rivals and slogans, re-arm era-renewable uniques) is designed but not built. Day 200 will look like day 40 with different names; that is a known, accepted v1 limitation. |

## Build phases

Each phase is one PR under ~1,000 changed lines and ends in something you can look at.

**Phase 1 — Walking skeleton, part A: a world that ticks** (~600)
`packages/shared/{tick,rng,events,ids}.ts`; `apps/sim` scaffold; `World` with 2 hardcoded teams of 3 heroes on ONE hardcoded 60×40 floor (a literal tile array + a 12-room graph, no procgen); `step()` does a random walk over the room graph and appends `EXPLORED` events. Vitest.
**Demo:** `npm run sim` prints a tick counter and a stream of "The Ninth Regrettables entered the Rat Exchange" to stdout, forever, deterministically for a given seed.

**Phase 2 — Walking skeleton, part B: it survives a restart** (~600)
`db/{open,migrate}.ts` + migration 001 with **five** tables (world, teams, heroes, rooms, events); `flush.ts` one IMMEDIATE txn every 30 ticks; `boot.ts` cold load + tail-ring hydrate. No retention, no repair, no snapshots, no ledger, no scheduler.
**Demo:** `sqlite3 donjon.db "select tick from world"` advances; `kill -9` and restart resumes within 29 ticks; `select count(*) from events` grows monotonically.

**Phase 3 — Walking skeleton, part C: you can watch it** (~750)
`net/http.ts` + `GET /api/v1/{bootstrap,state}`; `net/sse/hub.ts` sending a **full snapshot** every 500 ms (no deltas, no ring, no cursor); SvelteKit app with `app.css`, the grid shell, one `<canvas>` drawing terrain + tokens with **zero interpolation**, and `ConnectionBanner`.
**Demo:** open `http://localhost:5173` — two coloured tokens step across a tile grid twice a second. Restart the sim; the page reconnects and the tokens are where they were.

**Phase 4 — Real dungeon: floors, combat, loot, death** (~950)
`gen/floorgen.ts` + `gen/apsp.ts` (real procedural floors, lazy generation); `systems/{combat,movement,progression,loot,traps}.ts`; `scheduler.ts`; the full `events`/`heroes`/`monsters`/`items`/`floors`/`rooms` schema in a second migration.
**Demo:** teams fight monsters on generated floors, heroes take damage, go down, die; the ticker shows real combat and the map shows blood-red death flashes.

**Phase 5 — Real behaviour: AI, economy, the Keeper** (~900)
`systems/{teamAi,morale,economy,dungeon,recruit,ranking}.ts`; `ledger` + `team_stats` + `hero_counters` tables; the four homeostasis loops; the Khan loan with repayment and austerity.
**Demo:** teams choose to descend, retreat, rest and flee visibly; the Keeper panel shows treasury moving, corpse tax landing, wages going out, and the loan being taken and repaid.

**Phase 6 — Content pipeline + first pack** (~900)
`packages/content`: schema, build CLI, loader, parse, render, select, grammar, `narrate()`. A starter pack: 10 species, 6 classes, name tables, 8 verb pools, ~80 templates across the 12 highest-volume types.
**Demo:** the ticker stops saying `COMBAT_ROUND team=3 dmg=7` and starts saying "Palmyre Quackson cleaves the goblin clerk, who files an incident report." Restart with a new seed; the prose is different and reproducible.

**Phase 7 — Delta protocol + interpolation** (~850)
`snapshot/delta.ts` (`buildFrame`, phase-ordered ops), the 600-frame ring, `?since` cursor, backpressure + needsResync, client `applyFrame` + `MotionBuffer` + playback clock + `warp`. The `frames.golden.jsonl` shared suite and `DONJON_VERIFY_DELTAS=1`.
**Demo:** tokens glide smoothly at 60 fps between 2 Hz updates; background the tab for 2 minutes and it resumes seamlessly; for 10 minutes and it resyncs with a "catching up" chip and no visible wipe.

**Phase 8 — The dashboard proper** (~950)
`StatCard`, `TeamCard`, `LeaderboardRow`, `EventTicker(+Item)`, `KeeperStatusPanel`, `HeroMemorial`, `FloorSelector`, `NumberTicker`, `EmptyState`, `InspectorPopover`; Lucide + Fontsource; the full `@theme` block; camera pan/zoom/follow; fog; hit testing.
**Demo:** the wireframe above, live, with real numbers.

**Phase 9 — Content volume A** (4 PRs, ~900 each)
Monsters (24) · items (40) + loot tables · rooms (15) + traps (12) · lexicon verbs + pools.
**Demo:** the same dungeon with 24 distinct monsters, 40 items and 15 room archetypes; the feed stops repeating within a minute.

**Phase 10 — Content volume B: templates** (4 PRs, ~1,000 each)
100 templates per PR across the 27 narrated types, plus voices, team-names, epithets and `economy.json` with 6 decrees.
**Demo:** ~400 templates; the reader can watch for 20 minutes without seeing an obvious repeat.

**Phase 11 — Durability: repair, retention, snapshots, ops** (~900)
`repair.ts`, `retention.ts` (four tiers + snapshot prune + ledger rollup + `hall_of_fame` promotion), binary snapshot serialiser, `ops/{shutdown,health}.ts`, `/metrics`, admin server, systemd units + Caddyfile.
**Demo:** `POST /admin/checkpoint` reports bytes reclaimed; `kill -9` mid-flush and the repair report on boot is all zeros; DB size flat across a day.

**Phase 12 — Invariants, determinism, a11y** (~900)
`test/invariants.ts` (22 predicates), `soak.test.ts`, `determinism.test.ts`, the runtime watchdog; `/text` route, keyboard reticle, the three live regions, reduced-motion plumbing, contrast token test.
**Demo:** `npm run soak` prints the steady-state band table green; unplug the mouse and navigate the whole dashboard; turn on a screen reader and the feed is usable.

## Verification

```bash
npm install
npm -w packages/content run content:build      # emits packs/dist/pack.<hash>.json + pack.d.ts
npm run check                                  # tsc --build + svelte-check across all workspaces
npm run lint                                   # incl. no-restricted-globals in apps/sim/src/engine/**
npm test                                       # unit + 20k-tick determinism + protocol golden frames
npm run soak                                   # 100k-tick headless soak with band assertions
npm run dev                                    # sim on :8787 + web on :5173, concurrently
```

**In the browser** (`http://localhost:5173`):
1. Tokens move one tile per second, smoothly, with no snapping and no stalling mid-tile.
2. The ticker scrolls narrated prose, not raw payloads; no exact sentence repeats inside a 20-minute watch.
3. `Cmd-Shift-R` — the SSR HTML already shows the board with no visible reset on hydrate.
4. Kill the sim (`Ctrl-C`): the banner goes amber at 1.5 s, red at 8 s, the map hatches, counters freeze. Restart: the banner goes green within the backoff and the board catches up without flashing empty.
5. Background the tab 2 minutes → seamless resume. 10 minutes → "catching up" chip, then correct state, with the ticker and the 24 h casualty sparkline intact.
6. Tab through the whole page without a mouse: ~15 stops, focus ring visible on parchment, on stone and on the canvas.
7. `` ` `` opens the perf HUD: frame p95 < 12 ms with 8 teams on screen.

**Headless invariant test** (`test/soak.test.ts`) — genesis at seed `0xD0NJ0N`, run 100,000 ticks against `:memory:`, `checkAll(w)` every 500 ticks, sample every `DAY_TICKS`, assert bands over ticks 30k–100k, budget < 25 s wall. The 22 invariants:

1. `tick` increases by exactly 1 per `step()`. 2. `0 <= hp <= hp_max`; `hp === 0` iff DOWNED or DEAD. 3. Every hero with a `team_id` is in exactly one roster, ≤5 members. 4. Every `team.state` transition is legal per `TRANSITIONS`. 5. A FIGHTING team has ≥1 alive monster in its room. 6. Delving teams have non-null floor+room and `room.floor_id === team.floor_id`. 7. `dist[team.room][entry] < 255`. **8. Coin conservation, exact integer equality:** `Σhero.gold + Σteam.gold+carried + treasury + Σsinks === initial_coin + minted_cp`. 9. No negative money anywhere; `treasury_cp >= -25000`. 10. Every item has exactly one owner. 11. Dead heroes have null team, `died_tick`, `died_wall_ms`, no items. 12. `livingHeroes >= 1` always; mean over the window ∈ [25,50]. 13. `activeTeams ∈ [1,10]`; mean ∈ [4,8]. 14. `0 <= monster.hp <= hp_max`; guardians never change room. 15. After `popDue(t)` the heap holds nothing `due_tick <= t`. 16. No wake scheduled beyond `tick + 100000`. 17. `xp` non-decreasing; `level === levelForXp(xp)`; ≤20. 18. `renown_milli >= 0`; a team disbanded at T has `< 1000` by T+30000. 19. Floor depths contiguous from 1; every room reachable from entry. 20. **`loan_cp <= 25000`, and `=== 0` at least once per 50k ticks.** 21. **`max(floors.depth)` strictly increases at least once per 200k ticks.** 22. No NaN/Infinity in any numeric field; p99 tick < 3 ms; no tick emits > 200 events.

Plus `determinism.test.ts`: two 20k-tick runs from the same seed produce identical `worldDigest()` at every 1,000-tick checkpoint; `digest(step(fromSnapshot(snap@T), ×1000)) === recordedDigest@(T+1000)`; and a run with an extra phase consuming 50 draws from `RngDomain 26` every tick yields **identical** digests to the baseline.

**Restart survival.**
```bash
npm run sim &                                       # let it run ~5 minutes
sqlite3 donjon.db "select tick,status from world;"  # note T1
kill -9 %1
sqlite3 donjon.db "select tick,status from world;"  # status still 'running' → unclean
npm run sim                                         # boot logs the repair report
sqlite3 donjon.db "select tick from world;"         # >= T1 - 29, never less
```
Assert: the repair report is all zeros on a *clean* shutdown (`SIGTERM`); on an unclean one only `unclean_boots` increments; `PRAGMA integrity_check` is `ok`; one `DUNGEON_DORMANCY` event exists per restart gap; `dormancy_ms` accumulates the wall gap while `world.tick` does not jump.

**24-hour soak.**
```bash
DONJON_DB=/var/lib/donjon/soak.sqlite npm run sim &
watch -n 300 'curl -s localhost:8788/admin/diag | jq "{tick,db:.db,mem:.mem.heapUsed,clients:.hub.clients}"'
```
After 24 real hours (24 in-world days) assert: `ls -la` shows the DB flat within ±5 MB over the last 12 hours and `-wal` under 16 MB; `donjon_tick_jitter_ms` p99 < 40 ms and `donjon_eventloop_lag_ms` p99 < 50 ms; `ticks_dropped_total === 0`; RSS flat within 50 MB over the last 12 hours; zero `SIM_INVARIANT_VIOLATION` events; `select count(*) from hall_of_fame` between 48 and 120; `max(depth) from floors` ≥ 7; `loan_cp` has returned to 0 at least once; circulating coin inside [0.9M, 2.4M]. Leave a browser tab open for the full 24 h and confirm the ticker still updates, the DOM node count is within 200 of hour 1, and the map still renders at 60 fps.

## Deferred / out of scope for v1

- **Eras and world renewal** — `ERA_SHIFT`, floor regeneration, rival rotation, era-renewable unique templates. This is the honest long-horizon novelty gap; designed, not built.
- **The seven Objects of Destiny**, canon cameos (Herbert, Marvin, the Grand Khan, the Dust King), and the `unique: true` template tier with `template_fired`.
- **Insurance** (Cavallère Mutual, the 40-clause denial table) and the **Monsters' Union** (strikes, grievances, wage-withholding narrative beyond the austerity flag).
- Social colour events: ROMANCE, GOSSIP, SONG, VOW, GAMBLE, MEAL, DRINK, ARGUMENT, DUEL, MUTINY, THEFT.
- Resurrection, curses, item identification, hero merchants and shops beyond the flat entry/toll/tax model.
- FR/EN language toggle (the architecture supports it free; the second pack is the cost).
- Per-team fog-of-war persistence (`team_floor_fog`), the map heat overlay, and the whole-floor minimap.
- Archive worker thread, `/api/v1/replay`, CSV export, `/admin/reseed`, `/admin/spawn-team`.
- Server-side SSE filters (`?floor=`, `?teams=`), adaptive `?hz`, relay processes, the 2,000-client target.
- Density modes with hysteresis, list virtualisation, and the >10-team table fallback (`MAX_TEAMS = 10`).
- The palette derivation toolchain (`color.ts`, CIEDE2000, Viénot simulation, `palette.test.ts`) — values are frozen constants.
- The automated frontend leak gate: `memprobe`, the Playwright `SIM_SPEED=30` soak, COOP/COEP for `measureUserAgentSpecificMemory`. Replaced in v1 by `/metrics` gauges and the manual 24 h check above.
- Full-text search over the memorial, `leaderboard_snapshots` hourly history and rank-delta arrows over a 24 h window.