import { describe, expect, it } from 'vitest';
import { boot } from '../src/db/boot.js';
import { decodePath, encodePath } from '../src/db/codec.js';
import { Flusher } from '../src/db/flush.js';
import { MIGRATIONS, migrate } from '../src/db/migrate.js';
import { openDb, type Db } from '../src/db/open.js';
import { emit } from '../src/engine/emit.js';
import { step } from '../src/engine/step.js';
import { worldDigest } from '../src/engine/world.js';

const SEED = 0xd0f0a;

function memDb(): Db {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  return db;
}

describe('migrations', () => {
  it('applies once and is idempotent', () => {
    const db = openDb({ path: ':memory:' });
    const first = migrate(db);
    expect(first.applied.length).toBe(MIGRATIONS.length);
    const second = migrate(db);
    expect(second.applied).toEqual([]);
    expect(db.pragma('user_version', { simple: true })).toBe(MIGRATIONS.length);
    db.close();
  });

  it('creates STRICT tables that reject a bad severity', () => {
    const db = memDb();
    expect(() =>
      db
        .prepare(
          "INSERT INTO events (id, tick, type, severity, payload) VALUES (1, 1, 'EXPLORED', 4, '{}')",
        )
        .run(),
    ).toThrow();
    db.close();
  });
});

describe('path codec', () => {
  it('round-trips a tile path', () => {
    const path: Array<[number, number]> = [
      [0, 0],
      [59, 39],
      [12, 7],
    ];
    expect(decodePath(encodePath(path))).toEqual(path);
    expect(decodePath(encodePath([]))).toEqual([]);
  });
});

describe('flush and boot', () => {
  it('writes the world row and replays it into an identical digest', () => {
    const db = memDb();
    const { world, report } = boot(db, SEED);
    expect(report.fresh).toBe(true);

    const flusher = new Flusher(db);
    for (let i = 0; i < 120; i++) step(world);
    flusher.flush(world);

    const row = db.prepare('SELECT tick, next_event_id FROM world WHERE id = 1').get() as {
      tick: number;
      next_event_id: number;
    };
    expect(row.tick).toBe(120);
    expect(row.next_event_id).toBe(world.nextEventId);
    expect(world.pendingEvents.length).toBe(0);

    const { world: restored, report: second } = boot(db, SEED);
    expect(second.fresh).toBe(false);
    expect(restored.tick).toBe(120);
    expect(worldDigest(restored)).toBe(worldDigest(world));
    db.close();
  });

  it('loses at most FLUSH_EVERY-1 ticks on an unclean stop', () => {
    const db = memDb();
    const { world } = boot(db, SEED);
    const flusher = new Flusher(db);
    for (let i = 1; i <= 100; i++) {
      step(world);
      if (world.tick % 30 === 1) flusher.flush(world);
    }
    const persisted = (
      db.prepare('SELECT tick FROM world WHERE id = 1').get() as { tick: number }
    ).tick;
    expect(world.tick - persisted).toBeLessThan(30);
    db.close();
  });

  it('marks unclean boots and accumulates dormancy', () => {
    const db = memDb();
    const first = boot(db, SEED);
    new Flusher(db).flush(first.world);

    const second = boot(db, SEED);
    expect(second.report.unclean).toBe(true);
    expect(second.report.uncleanBoots).toBe(1);
    expect(second.report.bootCount).toBe(2);

    const flusher = new Flusher(db);
    flusher.markShutdownClean(second.world);

    const third = boot(db, SEED);
    expect(third.report.unclean).toBe(false);
    expect(third.report.uncleanBoots).toBe(1);
    expect(third.report.dormancyMs).toBeGreaterThanOrEqual(second.report.dormancyMs);
    db.close();
  });

  it('hydrates the tail ring from the events table', () => {
    const db = memDb();
    const { world } = boot(db, SEED);
    const flusher = new Flusher(db);
    for (let i = 0; i < 600; i++) {
      step(world);
      emit(world, { type: 'EXPLORED', teamId: null, payload: { room: `filler ${i}` } });
    }
    flusher.flush(world);

    const total = (db.prepare('SELECT count(*) as n FROM events').get() as { n: number }).n;
    expect(total).toBeGreaterThan(500);

    const { world: restored, report } = boot(db, SEED);
    expect(report.eventsHydrated).toBe(500);
    const tail = restored.tailRing.toArray();
    expect(tail.length).toBe(500);
    for (let i = 1; i < tail.length; i++) {
      expect((tail[i]?.id ?? 0) > (tail[i - 1]?.id ?? 0)).toBe(true);
    }
    db.close();
  });

  it('persists events exactly once across repeated flushes', () => {
    const db = memDb();
    const { world } = boot(db, SEED);
    const flusher = new Flusher(db);
    emit(world, { type: 'WORLD_INIT', payload: { seed: SEED } });
    for (let i = 0; i < 300; i++) {
      step(world);
      if (world.tick % 30 === 1) flusher.flush(world);
    }
    flusher.flush(world);
    const rows = db.prepare('SELECT id FROM events ORDER BY id').all() as Array<{ id: number }>;
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(rows.length).toBe(world.nextEventId - 1);
    db.close();
  });
});
