import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './+server.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function post(body: unknown): Request {
  return new Request('http://localhost/api/tunables', { method: 'POST', body: JSON.stringify(body) });
}

describe('GET /api/tunables', () => {
  it('proxies the list with the admin token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, tunables: [] }));
    const res = await GET({ request: new Request('http://localhost/api/tunables') } as never);
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8788/admin/config');
    expect((init.headers as Record<string, string>)['x-donjon-admin-token']).toBeTruthy();
  });

  it('502s when the admin port is down', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await GET({ request: new Request('http://localhost/api/tunables') } as never);
    expect(res.status).toBe(502);
  });
});

describe('POST /api/tunables', () => {
  it('set → PUT with JSON body, preserving upstream status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'unknown_key' } }, 404));
    const res = await POST({ request: post({ action: 'set', key: 'economy.coinSetpoint', value: 1 }) } as never);
    expect(res.status).toBe(404);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8788/admin/config/economy.coinSetpoint');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body as string)).toEqual({ value: 1 });
  });

  it('reset → DELETE', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await POST({ request: post({ action: 'reset', key: 'economy.coinSetpoint' }) } as never);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8788/admin/config/economy.coinSetpoint');
    expect(init.method).toBe('DELETE');
  });

  it('reset-all → POST', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, cleared: 3 }));
    await POST({ request: post({ action: 'reset-all' }) } as never);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8788/admin/config/reset-all');
    expect(init.method).toBe('POST');
  });

  it('400s on unknown action', async () => {
    const res = await POST({ request: post({ action: 'explode' }) } as never);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
