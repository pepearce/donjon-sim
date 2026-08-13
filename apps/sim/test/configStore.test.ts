import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { defineTunables, getTunable, resetTunable } from '@donjon/shared';
import type { Db } from '../src/db/open.js';
import { migrate } from '../src/db/migrate.js';
import {
  clearAllOverrides,
  clearOverride,
  loadOverrides,
  saveOverride,
} from '../src/db/configStore.js';

const T = defineTunables('test-store', {
  alpha: { default: 100, min: 0, max: 1000, label: 'Alpha' },
  beta: { default: 0.5, min: 0, max: 1, step: 0.01, label: 'Beta' },
});

let db: Db;

beforeEach(() => {
  db = new Database(':memory:');
  migrate(db);
});

afterEach(() => {
  resetTunable('test-store.alpha');
  resetTunable('test-store.beta');
  db.close();
});

describe('saveOverride', () => {
  it('persists the clamped value, updates the registry, and logs history', () => {
    const entry = saveOverride(db, 'test-store.alpha', 5000, 'admin', 111);
    expect(entry.value).toBe(1000);
    expect(T.alpha).toBe(1000);
    const row = db.prepare('SELECT value, updated_at FROM config_overrides WHERE key = ?')
      .get('test-store.alpha') as { value: number; updated_at: number };
    expect(row).toEqual({ value: 1000, updated_at: 111 });
    const hist = db.prepare('SELECT old_value, new_value, at, actor FROM config_history WHERE key = ?')
      .all('test-store.alpha');
    expect(hist).toEqual([{ old_value: 100, new_value: 1000, at: 111, actor: 'admin' }]);
  });

  it('upserts on repeat saves', () => {
    saveOverride(db, 'test-store.alpha', 200, 'admin', 1);
    saveOverride(db, 'test-store.alpha', 300, 'admin', 2);
    const rows = db.prepare('SELECT value FROM config_overrides WHERE key = ?').all('test-store.alpha');
    expect(rows).toEqual([{ value: 300 }]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM config_history').get()).toEqual({ n: 2 });
  });

  it('throws on unknown key and writes nothing', () => {
    expect(() => saveOverride(db, 'nope.nope', 1, 'admin', 1)).toThrow('unknown tunable: nope.nope');
    expect(db.prepare('SELECT COUNT(*) AS n FROM config_overrides').get()).toEqual({ n: 0 });
  });
});

describe('loadOverrides', () => {
  it('round-trips overrides through a fresh boot', () => {
    saveOverride(db, 'test-store.alpha', 250, 'admin', 5);
    resetTunable('test-store.alpha');
    expect(T.alpha).toBe(100);
    const skipped = loadOverrides(db);
    expect(skipped).toEqual([]);
    expect(T.alpha).toBe(250);
    expect(getTunable('test-store.alpha').overridden).toBe(true);
  });

  it('skips unknown keys without throwing', () => {
    db.prepare('INSERT INTO config_overrides (key, value, updated_at) VALUES (?, ?, ?)')
      .run('gone.key', 1, 1);
    expect(loadOverrides(db)).toEqual(['gone.key']);
  });
});

describe('clearOverride', () => {
  it('deletes the row, resets the registry, and logs history', () => {
    saveOverride(db, 'test-store.alpha', 250, 'admin', 5);
    const entry = clearOverride(db, 'test-store.alpha', 'admin', 6);
    expect(entry.value).toBe(100);
    expect(entry.overridden).toBe(false);
    expect(T.alpha).toBe(100);
    expect(db.prepare('SELECT COUNT(*) AS n FROM config_overrides').get()).toEqual({ n: 0 });
    const last = db.prepare('SELECT old_value, new_value FROM config_history ORDER BY id DESC LIMIT 1').get();
    expect(last).toEqual({ old_value: 250, new_value: 100 });
  });
});

describe('clearAllOverrides', () => {
  it('clears every override and reports the count', () => {
    saveOverride(db, 'test-store.alpha', 250, 'admin', 5);
    saveOverride(db, 'test-store.beta', 0.9, 'admin', 5);
    expect(clearAllOverrides(db, 'admin', 6)).toBe(2);
    expect(T.alpha).toBe(100);
    expect(T.beta).toBe(0.5);
    expect(db.prepare('SELECT COUNT(*) AS n FROM config_overrides').get()).toEqual({ n: 0 });
  });
});
