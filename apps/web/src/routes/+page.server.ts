import type { BootstrapDTO, FloorMapDTO } from '@donjon/shared';
import type { PageServerLoad } from './$types.js';

const SIM_ORIGIN = process.env['DONJON_API'] ?? 'http://localhost:8787';

export const load: PageServerLoad = async ({ fetch }) => {
  try {
    const [bootRes, mapRes] = await Promise.all([
      fetch(`${SIM_ORIGIN}/api/v1/bootstrap`),
      fetch(`${SIM_ORIGIN}/api/v1/floors/1/map`),
    ]);
    if (!bootRes.ok || !mapRes.ok) throw new Error('sim unavailable');
    const bootstrap = (await bootRes.json()) as BootstrapDTO;
    const floorMap = (await mapRes.json()) as FloorMapDTO;
    return { bootstrap, floorMap, offline: false };
  } catch {
    return { bootstrap: null, floorMap: null, offline: true };
  }
};
