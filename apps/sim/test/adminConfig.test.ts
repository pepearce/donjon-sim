import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import Database from 'better-sqlite3';
import { defineTunables, listTunables, resetTunable } from '@donjon/shared';
import type { Db } from '../src/db/open.js';
import { migrate } from '../src/db/migrate.js';
import { clearAllOverrides, clearOverride, saveOverride } from '../src/db/configStore.js';
import { createAdminServer } from '../src/net/admin.js';

const T = defineTunables('test-admin', {
  gamma: { default: 50, min: 0, max: 100, label: 'Gamma' },
});

const TOKEN = 'test-token';
let db: Db;
let server: Server;
let base: string;

beforeAll(async () => {
  db = new Database(':memory:');
  migrate(db);
  server = createAdminServer({
    token: TOKEN,
    onPause() {},
    onResume() {},
    onStep() {},
    onSpeed() {},
    onCheckpoint: () => ({}),
    onDiag: () => ({}),
    log() {},
    onConfigList: () => listTunables(),
    onConfigSet: (key, value) => saveOverride(db, key, value, 'admin', 42),
    onConfigReset: (key) => clearOverride(db, key, 'admin', 42),
    onConfigResetAll: () => clearAllOverrides(db, 'admin', 42),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  resetTunable('test-admin.gamma');
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

function call(path: string, init: RequestInit = {}, token = TOKEN): Promise<Response> {
  return fetch(`${base}${path}`, {
    ...init,
    headers: { 'x-donjon-admin-token': token, ...(init.headers ?? {}) },
  });
}

describe('GET /admin/config', () => {
  it('rejects a bad token', async () => {
    const res = await call('/admin/config', {}, 'wrong');
    expect(res.status).toBe(403);
  });

  it('lists tunables with spec and value', async () => {
    const res = await call('/admin/config');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; tunables: Array<{ key: string }> };
    expect(body.ok).toBe(true);
    expect(body.tunables.some((t) => t.key === 'test-admin.gamma')).toBe(true);
  });
});

describe('PUT /admin/config/:key', () => {
  it('sets and clamps, returning the entry', async () => {
    const res = await call('/admin/config/test-admin.gamma', {
      method: 'PUT',
      body: JSON.stringify({ value: 250 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; tunable: { value: number; overridden: boolean } };
    expect(body.tunable.value).toBe(100);
    expect(body.tunable.overridden).toBe(true);
    expect(T.gamma).toBe(100);
  });

  it('404s on unknown key', async () => {
    const res = await call('/admin/config/nope.nope', {
      method: 'PUT',
      body: JSON.stringify({ value: 1 }),
    });
    expect(res.status).toBe(404);
  });

  it('400s on non-numeric value and malformed JSON', async () => {
    const bad = await call('/admin/config/test-admin.gamma', {
      method: 'PUT',
      body: JSON.stringify({ value: 'many' }),
    });
    expect(bad.status).toBe(400);
    const malformed = await call('/admin/config/test-admin.gamma', { method: 'PUT', body: '{oops' });
    expect(malformed.status).toBe(400);
  });
});

describe('DELETE /admin/config/:key', () => {
  it('resets to default', async () => {
    await call('/admin/config/test-admin.gamma', { method: 'PUT', body: JSON.stringify({ value: 80 }) });
    const res = await call('/admin/config/test-admin.gamma', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tunable: { value: number; overridden: boolean } };
    expect(body.tunable.value).toBe(50);
    expect(body.tunable.overridden).toBe(false);
  });

  it('404s on unknown key', async () => {
    const res = await call('/admin/config/nope.nope', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('POST /admin/config/reset-all', () => {
  it('clears every override', async () => {
    await call('/admin/config/test-admin.gamma', { method: 'PUT', body: JSON.stringify({ value: 80 }) });
    const res = await call('/admin/config/reset-all', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { cleared: number }).cleared).toBeGreaterThanOrEqual(1);
    expect(T.gamma).toBe(50);
  });
});
