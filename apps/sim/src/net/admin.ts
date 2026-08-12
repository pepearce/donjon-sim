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

export function createAdminServer(deps: AdminDeps): Server {
  const handler = (req: IncomingMessage, res: ServerResponse): void => {
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

  return createServer(handler);
}
