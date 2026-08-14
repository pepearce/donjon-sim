import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const ADMIN = process.env['DONJON_ADMIN'] ?? 'http://127.0.0.1:8788';
const TOKEN = process.env['DONJON_ADMIN_TOKEN'] ?? 'donjon-local-dev-token';

const ALLOWED_SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 30];

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json()) as { action?: string; speed?: number };
  const headers = { 'x-donjon-admin-token': TOKEN };

  try {
    if (body.action === 'pause' || body.action === 'resume') {
      const res = await fetch(`${ADMIN}/admin/${body.action}`, { method: 'POST', headers });
      return json(await res.json());
    }

    if (body.action === 'speed') {
      const speed = Number(body.speed);
      if (!ALLOWED_SPEEDS.includes(speed)) {
        return json({ error: { code: 'bad_speed', message: `speed must be one of ${ALLOWED_SPEEDS.join(', ')}` } }, { status: 400 });
      }
      const res = await fetch(`${ADMIN}/admin/speed?x=${speed}`, { method: 'POST', headers });
      return json(await res.json());
    }

    if (body.action === 'step') {
      const res = await fetch(`${ADMIN}/admin/step?n=1`, { method: 'POST', headers });
      return json(await res.json());
    }

    if (body.action === 'restart') {
      const res = await fetch(`${ADMIN}/admin/restart`, { method: 'POST', headers });
      return json(await res.json());
    }

    return json({ error: { code: 'bad_action', message: 'unknown action' } }, { status: 400 });
  } catch {
    return json({ error: { code: 'admin_unreachable', message: 'the simulation admin port is not answering' } }, { status: 502 });
  }
};
