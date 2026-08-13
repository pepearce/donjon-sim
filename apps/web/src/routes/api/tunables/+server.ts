import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const ADMIN = process.env['DONJON_ADMIN'] ?? 'http://127.0.0.1:8788';
const TOKEN = process.env['DONJON_ADMIN_TOKEN'] ?? 'donjon-local-dev-token';
const HEADERS = { 'x-donjon-admin-token': TOKEN };

function unreachable(): Response {
  return json(
    { error: { code: 'admin_unreachable', message: 'the simulation admin port is not answering' } },
    { status: 502 },
  );
}

async function passthrough(res: Response): Promise<Response> {
  return json(await res.json(), { status: res.status });
}

export const GET: RequestHandler = async () => {
  try {
    return await passthrough(await fetch(`${ADMIN}/admin/config`, { headers: HEADERS }));
  } catch {
    return unreachable();
  }
};

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as { action?: string; key?: string; value?: number };

  if (body.action === 'set' && typeof body.key === 'string') {
    try {
      const res = await fetch(`${ADMIN}/admin/config/${encodeURIComponent(body.key)}`, {
        method: 'PUT',
        headers: { ...HEADERS, 'content-type': 'application/json' },
        body: JSON.stringify({ value: body.value }),
      });
      return await passthrough(res);
    } catch {
      return unreachable();
    }
  }

  if (body.action === 'reset' && typeof body.key === 'string') {
    try {
      const res = await fetch(`${ADMIN}/admin/config/${encodeURIComponent(body.key)}`, {
        method: 'DELETE',
        headers: HEADERS,
      });
      return await passthrough(res);
    } catch {
      return unreachable();
    }
  }

  if (body.action === 'reset-all') {
    try {
      const res = await fetch(`${ADMIN}/admin/config/reset-all`, { method: 'POST', headers: HEADERS });
      return await passthrough(res);
    } catch {
      return unreachable();
    }
  }

  return json({ error: { code: 'bad_action', message: 'unknown action' } }, { status: 400 });
};
