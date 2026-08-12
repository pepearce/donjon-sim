import { MAX_CATCHUP_TICKS, TICK_MS } from '@donjon/shared';
import { step } from './engine/step.js';
import type { World } from './engine/world.js';

export interface LoopHandle {
  stop(): void;
  ticksDropped(): number;
  setSpeed(speed: number): void;
  speed(): number;
}

export interface LoopOptions {
  speed: number;
  onTick(world: World): void;
  paused?(): boolean;
}

export function startLoop(world: World, options: LoopOptions): LoopHandle {
  let period = TICK_MS / options.speed;
  let currentSpeed = options.speed;
  let nextAt = Date.now() + period;
  let dropped = 0;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const run = (): void => {
    if (stopped) return;
    const now = Date.now();
    let behind = Math.floor((now - nextAt) / period) + 1;
    if (behind > MAX_CATCHUP_TICKS) {
      dropped += behind - MAX_CATCHUP_TICKS;
      behind = MAX_CATCHUP_TICKS;
      nextAt = now;
    }
    const isPaused = options.paused?.() ?? false;
    for (let i = 0; i < behind; i++) {
      if (!isPaused) {
        step(world);
        options.onTick(world);
      }
      nextAt += period;
    }
    const delay = Math.max(0, nextAt - Date.now());
    timer = setTimeout(run, delay);
  };

  timer = setTimeout(run, period);

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    },
    ticksDropped: () => dropped,
    speed: () => currentSpeed,
    setSpeed: (speed: number) => {
      currentSpeed = speed;
      period = TICK_MS / speed;
      nextAt = Date.now() + period;
    },
  };
}
