function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number, got ${raw}`);
  return parsed;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

export const DEFAULT_SEED = 0xd0f0a;

export interface Config {
  seed: number;
  speed: number;
  logLevel: string;
  maxTicks: number;
  dbPath: string;
  port: number;
  adminPort: number;
  adminToken: string;
  feedSeverity: number;
}

export function loadConfig(): Config {
  return {
    seed: num('DONJON_SEED', DEFAULT_SEED),
    speed: num('DONJON_SPEED', 1),
    logLevel: str('DONJON_LOG_LEVEL', 'info'),
    maxTicks: num('DONJON_MAX_TICKS', 0),
    dbPath: str('DONJON_DB', 'donjon.db'),
    port: num('DONJON_PORT', 8787),
    adminPort: num('DONJON_ADMIN_PORT', 8788),
    adminToken: str('DONJON_ADMIN_TOKEN', 'donjon-local-dev-token'),
    feedSeverity: num('DONJON_FEED_SEVERITY', 1),
  };
}
