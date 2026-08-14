import { timingSafeEqual } from 'node:crypto';
import type { Handle } from '@sveltejs/kit';

const PASSWORD = process.env['DONJON_ADMIN_PASSWORD'];
const GUARDED = ['/admin', '/api/tunables', '/api/control'];

function passwordMatches(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function unauthorized(): Response {
  return new Response('unauthorized', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="donjon-admin"' },
  });
}

export const handle: Handle = async ({ event, resolve }) => {
  if (!PASSWORD || !GUARDED.some((prefix) => event.url.pathname.startsWith(prefix))) {
    return resolve(event);
  }

  const header = event.request.headers.get('authorization') ?? '';
  if (!header.startsWith('Basic ')) return unauthorized();

  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon === -1) return unauthorized();

  const provided = decoded.slice(colon + 1);
  if (!passwordMatches(PASSWORD, provided)) return unauthorized();

  return resolve(event);
};
