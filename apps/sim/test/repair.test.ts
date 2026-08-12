import { describe, expect, it } from 'vitest';
import { boot } from '../src/db/boot.js';
import { Flusher } from '../src/db/flush.js';
import { migrate } from '../src/db/migrate.js';
import { openDb, type Db } from '../src/db/open.js';
import { repair } from '../src/db/repair.js';
import { step } from '../src/engine/step.js';

const SEED = 0xd0f0a;

function liveDb(ticks: number): Db {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  const { world } = boot(db, SEED);
  const flusher = new Flusher(db);
  for (let i = 0; i < ticks; i++) step(world);
  flusher.flush(world);
  return db;
}

describe('repair', () => {
  it('reports clean on a healthy database', () => {
    const db = liveDb(300);
    const report = repair(db);
    expect(report.integrity).toBe('ok');
    expect(report.clean).toBe(true);
    db.close();
  });

  it('detaches heroes whose team no longer exists', () => {
    const db = liveDb(300);
    db.pragma('foreign_keys = OFF');
    db.prepare('INSERT INTO heroes (id, name, species, class_name, primary_stat, team_id, level, xp, hp, hp_max, str, agi, wil, state, born_tick) VALUES (99999, ?, ?, ?, ?, 4242, 1, 0, 5, 5, 10, 10, 10, ?, 0)')
      .run('Orphan', 'duck', 'sabreur', 'str', 'ok');
    db.pragma('foreign_keys = ON');
    const report = repair(db);
    expect(report.orphanHeroes).toBe(1);
    expect(report.clean).toBe(false);
    const after = db.prepare('SELECT team_id FROM heroes WHERE id = 99999').get() as { team_id: number | null };
    expect(after.team_id).toBeNull();
    db.close();
  });

  it('drops events written ahead of the persisted world tick', () => {
    const db = liveDb(300);
    const tick = (db.prepare('SELECT tick FROM world WHERE id = 1').get() as { tick: number }).tick;
    db.prepare("INSERT INTO events (id, tick, type, severity, payload) VALUES (999999, ?, 'EXPLORED', 0, '{}')").run(
      tick + 5000,
    );
    const report = repair(db);
    expect(report.eventsAheadOfWorld).toBe(1);
    expect(db.prepare('SELECT count(*) as n FROM events WHERE id = 999999').get()).toEqual({ n: 0 });
    db.close();
  });

  it('is idempotent', () => {
    const db = liveDb(300);
    repair(db);
    const second = repair(db);
    expect(second.clean).toBe(true);
    db.close();
  });
});
