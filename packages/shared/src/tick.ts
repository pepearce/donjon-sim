export const TICK_MS = 1000;

export const DAY_TICKS = 3600;
export const WATCH_TICKS = DAY_TICKS / 3;

export const WATCHES = ['POTRON_MINET', 'ZENITH', 'CREPUSCULE'] as const;
export type Watch = (typeof WATCHES)[number];

export function watchAt(tick: number): Watch {
  const i = Math.floor((tick % DAY_TICKS) / WATCH_TICKS);
  return WATCHES[i] ?? 'POTRON_MINET';
}

export function dayOf(tick: number): number {
  return Math.floor(tick / DAY_TICKS);
}

export function HOURS(n: number): number {
  return Math.round((n * 3600 * 1000) / TICK_MS);
}

export function DAYS(n: number): number {
  return n * DAY_TICKS;
}

export const FLUSH_EVERY = 30;
export const DECAY_EVERY = 30;
export const TICKS_PER_FRAME = Math.max(1, Math.round(500 / TICK_MS));
export const MAX_CATCHUP_TICKS = 4;
