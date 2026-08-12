// @ts-nocheck
import type { BootstrapDTO } from '@donjon/shared';
import type { PageServerLoad } from './$types.js';

const SIM_ORIGIN = process.env['DONJON_API'] ?? 'http://localhost:8787';

export const load = async ({ fetch, setHeaders }: Parameters<PageServerLoad>[0]) => {
  setHeaders({ 'cache-control': 'no-store' });
  try {
    const res = await fetch(`${SIM_ORIGIN}/api/v1/bootstrap`);
    if (!res.ok) throw new Error('sim unavailable');
    const bootstrap = (await res.json()) as BootstrapDTO;
    return { snapshot: bootstrap.snapshot, offline: false };
  } catch {
    return { snapshot: null, offline: true };
  }
};
