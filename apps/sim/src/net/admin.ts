import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export interface AdminDeps {
  token: string;
  onPause(): void;
  onResume(): void;
  onStep(n: number): void;
  onSpeed(multiplier: number): void;
  onCheckpoint(): Record<string, unknown>;
  onDiag(): Record<string, unknown>;
  log(message: string): void;
  onConfigList(): unknown;
  onConfigSet(key: string, value: number): unknown;
  onConfigReset(key: string): unknown;
  onConfigResetAll(): number;
}

function unauthorised(res: ServerResponse): void {
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code: 'forbidden', message: 'admin is loopback + token only' } }));
}

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

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function fail(res: ServerResponse, status: number, code: string, message: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code, message } }));
}

export function createAdminServer(deps: AdminDeps): Server {
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!isLoopback(req) || !tokenMatches(deps.token, req.headers['x-donjon-admin-token'] as string | undefined)) {
      unauthorised(res);
      return;
    }

    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;
    const json = (body: unknown): void => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    deps.log(`admin ${req.method} ${path}${url.search}`);

    if (path === '/admin/config' && req.method === 'GET') {
      json({ ok: true, tunables: deps.onConfigList() });
      return;
    }

    if (path === '/admin/config/reset-all' && req.method === 'POST') {
      json({ ok: true, cleared: deps.onConfigResetAll() });
      return;
    }

    if (path.startsWith('/admin/config/')) {
      const key = decodeURIComponent(path.slice('/admin/config/'.length));
      if (req.method === 'PUT') {
        let value: unknown;
        try {
          value = (JSON.parse(await readBody(req)) as { value?: unknown }).value;
        } catch {
          fail(res, 400, 'bad_json', 'body must be JSON like {"value": 123}');
          return;
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          fail(res, 400, 'bad_value', 'value must be a finite number');
          return;
        }
        try {
          json({ ok: true, tunable: deps.onConfigSet(key, value) });
        } catch {
          fail(res, 404, 'unknown_key', key);
        }
        return;
      }
      if (req.method === 'DELETE') {
        try {
          json({ ok: true, tunable: deps.onConfigReset(key) });
        } catch {
          fail(res, 404, 'unknown_key', key);
        }
        return;
      }
      fail(res, 405, 'bad_method', `${req.method ?? ''} not allowed`);
      return;
    }

    switch (path) {
      case '/admin/pause':
        deps.onPause();
        json({ ok: true, status: 'paused' });
        return;
      case '/admin/resume':
        deps.onResume();
        json({ ok: true, status: 'running' });
        return;
      case '/admin/step': {
        const n = Math.max(1, Math.min(10_000, Number(url.searchParams.get('n') ?? 1)));
        deps.onStep(n);
        json({ ok: true, stepped: n });
        return;
      }
      case '/admin/speed': {
        const multiplier = Number(url.searchParams.get('x') ?? 1);
        if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 1000) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 'bad_speed', message: 'x must be in (0, 1000]' } }));
          return;
        }
        deps.onSpeed(multiplier);
        json({ ok: true, speed: multiplier });
        return;
      }
      case '/admin/checkpoint':
        json({ ok: true, ...deps.onCheckpoint() });
        return;
      case '/admin/diag':
        json(deps.onDiag());
        return;
      default:
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'not_found', message: path } }));
    }
  };

  return createServer((req, res) => {
    void handler(req, res).catch(() => {
      fail(res, 500, 'internal', 'admin handler failed');
    });
  });
}
