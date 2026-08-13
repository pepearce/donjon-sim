import {
  applyOverrides,
  clampTunable,
  getTunable,
  listTunables,
  resetTunable,
  setTunable,
  type TunableEntry,
} from '@donjon/shared';
import type { Db } from './open.js';

export function loadOverrides(db: Db): string[] {
  const rows = db
    .prepare('SELECT key, value, updated_at AS updatedAt FROM config_overrides')
    .all() as Array<{ key: string; value: number; updatedAt: number }>;
  return applyOverrides(rows);
}

export function saveOverride(
  db: Db,
  key: string,
  value: number,
  actor: string,
  now: number,
): TunableEntry {
  const before = getTunable(key);
  const clamped = clampTunable(key, value);
  db.transaction(() => {
    db.prepare(
      `INSERT INTO config_overrides (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, clamped, now);
    db.prepare(
      'INSERT INTO config_history (key, old_value, new_value, at, actor) VALUES (?, ?, ?, ?, ?)',
    ).run(key, before.value, clamped, now, actor);
  })();
  return setTunable(key, clamped, now);
}

export function clearOverride(db: Db, key: string, actor: string, now: number): TunableEntry {
  const before = getTunable(key);
  db.transaction(() => {
    db.prepare('DELETE FROM config_overrides WHERE key = ?').run(key);
    db.prepare(
      'INSERT INTO config_history (key, old_value, new_value, at, actor) VALUES (?, ?, ?, ?, ?)',
    ).run(key, before.value, before.default, now, actor);
  })();
  return resetTunable(key);
}

export function clearAllOverrides(db: Db, actor: string, now: number): number {
  const overridden = listTunables().filter((entry) => entry.overridden);
  db.transaction(() => {
    for (const entry of overridden) {
      db.prepare('DELETE FROM config_overrides WHERE key = ?').run(entry.key);
      db.prepare(
        'INSERT INTO config_history (key, old_value, new_value, at, actor) VALUES (?, ?, ?, ?, ?)',
      ).run(entry.key, entry.value, entry.default, now, actor);
    }
  })();
  for (const entry of overridden) resetTunable(entry.key);
  return overridden.length;
}
