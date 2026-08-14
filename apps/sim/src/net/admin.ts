import { createServer, type IncomingMessage, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { getRequestListener, type HttpBindings } from '@hono/node-server';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface AdminDeps {
  token: string;
  onPause(): void;
  onResume(): void;
  onStep(n: number): void;
  onSpeed(multiplier: number): void;
  onCheckpoint(): Record<string, unknown>;
  onDiag(): Record<string, unknown>;
  onRestart(): void;
  log(message: string): void;
  onConfigList(): unknown;
  onConfigSet(key: string, value: number): unknown;
  onConfigReset(key: string): unknown;
  onConfigResetAll(): number;
}

type Env = { Bindings: HttpBindings };

function tokenMatches(expected: string, provided: string | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isLoopback(req: IncomingMessage): boolean {
  const addr = req.socket.remoteAddress ?? '';
  const local = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  return local && req.headers['x-forwarded-for'] === undefined;
}

function fail(c: Context<Env>, status: ContentfulStatusCode, code: string, message: string): Response {
  return c.json({ error: { code, message } }, status);
}

export function createAdminServer(deps: AdminDeps): Server {
  const app = new Hono<Env>();

  app.use(async (c, next) => {
    if (!isLoopback(c.env.incoming) || !tokenMatches(deps.token, c.req.header('x-donjon-admin-token'))) {
      return fail(c, 403, 'forbidden', 'admin is loopback + token only');
    }
    const url = new URL(c.req.url);
    deps.log(`admin ${c.req.method} ${url.pathname}${url.search}`);
    await next();
  });

  app.get('/admin/config', (c) => c.json({ ok: true, tunables: deps.onConfigList() }));
  app.all('/admin/config', (c) => fail(c, 405, 'bad_method', `${c.req.method} not allowed`));

  app.post('/admin/config/reset-all', (c) => c.json({ ok: true, cleared: deps.onConfigResetAll() }));

  app.put('/admin/config/:key', async (c) => {
    const key = c.req.param('key');
    let value: unknown;
    try {
      value = ((await c.req.json()) as { value?: unknown }).value;
    } catch {
      return fail(c, 400, 'bad_json', 'body must be JSON like {"value": 123}');
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fail(c, 400, 'bad_value', 'value must be a finite number');
    }
    try {
      return c.json({ ok: true, tunable: deps.onConfigSet(key, value) });
    } catch {
      return fail(c, 404, 'unknown_key', key);
    }
  });

  app.delete('/admin/config/:key', (c) => {
    const key = c.req.param('key');
    try {
      return c.json({ ok: true, tunable: deps.onConfigReset(key) });
    } catch {
      return fail(c, 404, 'unknown_key', key);
    }
  });

  app.all('/admin/config/*', (c) => fail(c, 405, 'bad_method', `${c.req.method} not allowed`));

  app.all('/admin/pause', (c) => {
    deps.onPause();
    return c.json({ ok: true, status: 'paused' });
  });

  app.all('/admin/resume', (c) => {
    deps.onResume();
    return c.json({ ok: true, status: 'running' });
  });

  app.all('/admin/step', (c) => {
    const raw = Number(c.req.query('n') ?? 1);
    const n = Math.max(1, Math.min(10_000, Number.isFinite(raw) ? raw : 1));
    deps.onStep(n);
    return c.json({ ok: true, stepped: n });
  });

  app.all('/admin/speed', (c) => {
    const multiplier = Number(c.req.query('x') ?? 1);
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 1000) {
      return fail(c, 400, 'bad_speed', 'x must be in (0, 1000]');
    }
    deps.onSpeed(multiplier);
    return c.json({ ok: true, speed: multiplier });
  });

  app.post('/admin/restart', (c) => {
    deps.onRestart();
    return c.json({ ok: true, status: 'restarting' });
  });
  app.all('/admin/restart', (c) => fail(c, 405, 'bad_method', `${c.req.method} not allowed`));

  app.all('/admin/checkpoint', (c) => c.json({ ok: true, ...deps.onCheckpoint() }));

  app.all('/admin/diag', (c) => c.json(deps.onDiag()));

  app.notFound((c) => c.json({ error: { code: 'not_found', message: c.req.path } }, 404));

  app.onError((_err, c) => fail(c, 500, 'internal', 'admin handler failed'));

  return createServer(getRequestListener(app.fetch));
}
