import { FLUSH_EVERY, dayOf, listTunables, watchAt } from '@donjon/shared';
import { mix32 } from '@donjon/shared';
import { loadConfig } from './config.js';
import { boot, wipeWorld } from './db/boot.js';
import { rotateEpoch } from './epoch.js';
import { clearAllOverrides, clearOverride, loadOverrides, saveOverride } from './db/configStore.js';
import { Flusher } from './db/flush.js';
import { migrate } from './db/migrate.js';
import { openDb } from './db/open.js';
import { Retention } from './db/retention.js';
import { repair } from './db/repair.js';
import { createAdminServer } from './net/admin.js';
import { step } from './engine/step.js';
import { emit } from './engine/emit.js';
import { worldDigest, type World } from './engine/world.js';
import { logger, setLogLevel } from './log.js';
import { startLoop } from './loop.js';
import { createHttpServer } from './net/http.js';
import { Hub } from './net/hub.js';
import { narrateEvent, setPack } from './snapshot/projector.js';
import { loadCorePack } from '@donjon/content';

const config = loadConfig();
setLogLevel(config.logLevel);

const log = logger('sim');
const feed = logger('feed');
const dbLog = logger('db');

const db = openDb({ path: config.dbPath });
const migration = migrate(db);
if (migration.applied.length > 0) {
  dbLog.info(`migrated ${migration.from} -> ${migration.to} (${migration.applied.join(', ')})`);
}

const skippedOverrides = loadOverrides(db);
if (skippedOverrides.length > 0) {
  dbLog.warn(`config: skipped unknown override keys ${skippedOverrides.join(', ')}`);
}

const { pack, issues } = loadCorePack();
if (issues.length > 0) {
  for (const issue of issues) dbLog.warn(`content: ${issue.templateId} — ${issue.problem}`);
}
setPack(pack);
logger('content').info(
  `pack loaded: ${pack.templates.length} templates over ${pack.byType.size} event types, ` +
    `${Object.keys(pack.lexicon).length} lexicon pools, flavourHash=${pack.flavourHash}`,
);

const repairReport = repair(db);
if (!repairReport.clean) {
  dbLog.warn(
    `repair: orphanHeroes=${repairReport.orphanHeroes} orphanItems=${repairReport.orphanItems} ` +
      `orphanMonsters=${repairReport.orphanMonsters} staleTavern=${repairReport.staleTavern} ` +
      `eventsAhead=${repairReport.eventsAheadOfWorld} integrity=${repairReport.integrity}`,
  );
} else {
  dbLog.info(`repair: clean (integrity=${repairReport.integrity})`);
}

const { world, report } = boot(db, config.seed);
const flusher = new Flusher(db);
const retention = new Retention(db);

if (report.fresh) {
  log.info(
    `genesis seed=0x${config.seed.toString(16)} floors=${world.floors.length} ` +
      `rooms=${world.floors.reduce((n, f) => n + f.rooms.length, 0)} ` +
      `teams=${world.teams.length} heroes=${world.heroes.length} monsters=${world.monsters.length}`,
  );
} else {
  emit(world, {
    type: 'DUNGEON_DORMANCY',
    floorId: world.floors[0]?.id ?? 1,
    payload: { dormancyMs: report.dormancyMs, unclean: report.unclean ? 1 : 0 },
  });
  log.info(
    `resumed tick=${report.tick} boot=${report.bootCount} unclean=${report.unclean} ` +
      `uncleanBoots=${report.uncleanBoots} dormancyMs=${report.dormancyMs} ` +
      `eventsHydrated=${report.eventsHydrated}`,
  );
}

let printedThrough = 0;

function drain(w: World): void {
  for (const event of w.tailRing.last(128)) {
    if (event.id <= printedThrough) continue;
    printedThrough = event.id;
    if (event.severity < config.feedSeverity) continue;
    feed.info(
      `t${String(event.tick).padStart(6, '0')} ${narrateEvent(w, event.type, event.payload, event.teamId, event.id, event.tick)}`,
    );
  }
}

drain(world);

const hub = new Hub(config.speed);
const httpLog = logger('http');

const server = createHttpServer({
  world,
  hub,
  speed: () => loop.speed(),
  port: config.port,
  onStats: () => ({
    tick: world.tick,
    events: world.nextEventId - 1,
    flush: flusher.stats,
    hub: hub.stats,
    dbBytes: retention.dbBytes(),
    mem: process.memoryUsage(),
    uptimeSec: Math.round(process.uptime()),
  }),
});

server.listen(config.port, () => {
  httpLog.info(`api on http://localhost:${config.port}/api/v1/bootstrap`);
});

let paused = false;
const adminLog = logger('admin');

const admin = createAdminServer({
  token: config.adminToken,
  onPause: () => {
    paused = true;
  },
  onResume: () => {
    paused = false;
  },
  onStep: (n) => {
    for (let i = 0; i < n; i++) step(world);
  },
  onSpeed: (multiplier) => {
    hub.setSpeed(multiplier);
    loop.setSpeed(multiplier);
    broadcastEvery = Math.max(1, Math.round(500 / (1000 / multiplier)));
  },
  onCheckpoint: () => {
    const before = retention.dbBytes();
    flusher.flush(world);
    const report2 = retention.run(world.tick);
    retention.vacuumStep();
    flusher.checkpoint('PASSIVE');
    return { bytesBefore: before, bytesAfter: retention.dbBytes(), pruned: report2 };
  },
  onDiag: () => ({
    tick: world.tick,
    paused,
    speed: loop.speed(),
    teams: world.teams.filter((t) => t.state !== 'disbanded').length,
    heroesLiving: world.heroes.filter((h) => h.state !== 'dead' && h.retiredTick === null).length,
    apexEpoch: world.dungeon.apexEpoch,
    floors: world.floors.length,
    db: { bytes: retention.dbBytes() },
    hub: hub.stats,
    flush: flusher.stats,
    mem: process.memoryUsage(),
    uptimeSec: Math.round(process.uptime()),
  }),
  log: (m) => adminLog.info(m),
  onConfigList: () => listTunables(),
  onConfigSet: (key, value) => saveOverride(db, key, value, 'admin', Date.now()),
  onConfigReset: (key) => clearOverride(db, key, 'admin', Date.now()),
  onConfigResetAll: () => clearAllOverrides(db, 'admin', Date.now()),
});

admin.listen(config.adminPort, '127.0.0.1', () => {
  adminLog.info(`admin on http://127.0.0.1:${config.adminPort}/admin/diag (loopback + token only)`);
});

let broadcastEvery = Math.max(1, Math.round(500 / (1000 / config.speed)));
const heartbeat = setInterval(() => hub.heartbeat(), 10_000);

function reforge(w: World): void {
  const oldSeed = w.seed;
  const oldTick = w.tick;
  drain(w);
  flusher.flush(w);
  wipeWorld(db);

  const nextSeed = mix32(oldSeed ^ (oldTick + 0x9e3779b9)) >>> 0;
  const { world: fresh } = boot(db, nextSeed);
  Object.assign(w, fresh);
  printedThrough = 0;
  hub.reset();
  rotateEpoch();
  drain(w);
  flusher.flush(w);

  log.info(
    `foreclosure: world reforged at old tick=${oldTick}, ` +
      `new seed=0x${nextSeed.toString(16)} floors=${w.floors.length} teams=${w.teams.length}`,
  );
}

const loop = startLoop(world, {
  speed: config.speed,
  paused: () => paused,
  onTick: (w) => {
    if (w.foreclosed) {
      reforge(w);
      return;
    }
    drain(w);
    if (w.tick % FLUSH_EVERY === 1) flusher.flush(w);
    if (w.tick % broadcastEvery === 0) setImmediate(() => hub.broadcast(w));

    if (w.tick % 60 === 0) {
      log.info(
        `tick=${w.tick} day=${dayOf(w.tick)} watch=${watchAt(w.tick)} ` +
          `events=${w.nextEventId - 1} flushes=${flusher.stats.flushes} ` +
          `digest=${worldDigest(w).slice(0, 12)}`,
      );
    }
    if (w.tick % 3600 === 0) flusher.checkpoint('PASSIVE');

    if (w.tick % 1800 === 7) {
      const report = retention.run(w.tick);
      retention.pruneDeadMonsters();
      retention.vacuumStep();
      const deleted =
        Object.values(report.deletedBySeverity).reduce((a, b) => a + b, 0) + report.deletedOverCap;
      if (deleted > 0) {
        dbLog.info(
          `retention pruned ${deleted} events, ${report.remaining} remain, ` +
            `db=${(retention.dbBytes() / 1048576).toFixed(1)}MB`,
        );
      }
    }

    if (config.maxTicks > 0 && w.tick >= config.maxTicks) {
      log.info(`reached DONJON_MAX_TICKS=${config.maxTicks}, stopping`);
      shutdown('MAX_TICKS');
    }
  },
});

function shutdown(signal: string): void {
  loop.stop();
  clearInterval(heartbeat);
  hub.closeAll();
  server.close();
  admin.close();
  flusher.markShutdownClean(world);
  flusher.checkpoint('TRUNCATE');
  db.close();
  log.info(
    `${signal} at tick=${world.tick} dropped=${loop.ticksDropped()} ` +
      `flushes=${flusher.stats.flushes} events=${flusher.stats.eventsWritten}`,
  );
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
