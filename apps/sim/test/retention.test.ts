import { describe, expect, it } from 'vitest';
import { DAY_TICKS, HOURS } from '@donjon/shared';
import { migrate } from '../src/db/migrate.js';
import { openDb, type Db } from '../src/db/open.js';
import { Retention, SEVERITY_HORIZON_TICKS } from '../src/db/retention.js';

function seeded(): Db {
  const db = openDb({ path: ':memory:' });
  migrate(db);
  const insert = db.prepare(
    "INSERT INTO events (id, tick, type, severity, payload) VALUES (?, ?, 'EXPLORED', ?, '{}')",
  );
  let id = 1;
  const add = (tick: number, severity: number, n: number): void => {
    const txn = db.transaction(() => {
      for (let i = 0; i < n; i++) insert.run(id++, tick, severity);
    });
    txn();
  };
  add(10, 0, 500);
  add(10, 1, 300);
  add(10, 2, 100);
  add(10, 3, 50);
  add(1_000_000, 0, 40);
  add(1_000_000, 3, 10);
  return db;
}

describe('retention', () => {
  it('derives every horizon from TICK_MS, not hardcoded tick literals', () => {
    expect(SEVERITY_HORIZON_TICKS[0]).toBe(HOURS(6));
    expect(SEVERITY_HORIZON_TICKS[1]).toBe(HOURS(48));
    expect(SEVERITY_HORIZON_TICKS[2]).toBe(DAY_TICKS * 30);
    expect(SEVERITY_HORIZON_TICKS[3]).toBe(Number.POSITIVE_INFINITY);
  });

  it('prunes chatter first and keeps severity 3 forever', () => {
    const db = seeded();
    const report = new Retention(db).run(1_000_000);

    expect(report.deletedBySeverity[0]).toBe(500);
    expect(report.deletedBySeverity[1]).toBe(300);
    expect(report.deletedBySeverity[2]).toBe(100);
    expect(report.deletedBySeverity[3]).toBe(0);

    const bySeverity = db
      .prepare('SELECT severity, count(*) as n FROM events GROUP BY severity ORDER BY severity')
      .all() as Array<{ severity: number; n: number }>;
    expect(bySeverity).toEqual([
      { severity: 0, n: 40 },
      { severity: 3, n: 60 },
    ]);
    db.close();
  });

  it('is idempotent and leaves recent events alone', () => {
    const db = seeded();
    const retention = new Retention(db);
    retention.run(1_000_000);
    const after = retention.run(1_000_000);
    expect(Object.values(after.deletedBySeverity).reduce((a, b) => a + b, 0)).toBe(0);
    expect(after.remaining).toBe(100);
    db.close();
  });

  it('does not delete anything before the first horizon elapses', () => {
    const db = seeded();
    const report = new Retention(db).run(100);
    expect(Object.values(report.deletedBySeverity).reduce((a, b) => a + b, 0)).toBe(0);
    db.close();
  });

  it('drops dead monsters and reports db size', () => {
    const db = seeded();
    db.prepare(
      `INSERT INTO monsters (id, name, cr_milli, hp, hp_max, atk, def, dr, dmg_sides, dmg_bonus,
        xp, wage_cp_per_day, room_id, floor_id, guardian, alive)
       VALUES (1, 'rat', 1000, 0, 10, 6, 7, 0, 6, 0, 10, 20, 1, 1, 0, 0)`,
    ).run();
    const retention = new Retention(db);
    expect(retention.pruneDeadMonsters()).toBe(1);
    expect(retention.dbBytes()).toBeGreaterThan(0);
    db.close();
  });
});
