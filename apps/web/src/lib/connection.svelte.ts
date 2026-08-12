import type { FrameDTO, SnapshotDTO } from '@donjon/shared';
import { applyFrame, type MotionState } from './applyFrame.js';
import type { SimStore } from './store.svelte.js';

const STALE_AFTER_MS = 8_000;
const AMBER_AFTER_MS = 1_500;
const STALL_ABORT_MS = 12_000;
const MAX_BACKOFF_MS = 30_000;

export interface Connection {
  close(): void;
}

export function connect(store: SimStore, motion: MotionState, streamUrl = '/api/v1/stream'): Connection {
  let controller: AbortController | null = null;
  let closed = false;
  let attempt = 0;
  let generation = 0;
  let lastByteAt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleRetry = (immediate = false): void => {
    if (closed) return;
    if (retryTimer) clearTimeout(retryTimer);
    attempt += 1;
    const delay = immediate ? 250 : Math.min(MAX_BACKOFF_MS, 500 * 2 ** Math.min(attempt, 6));
    store.retryInSec = Math.round(delay / 1000);
    retryTimer = setTimeout(() => void open(), delay);
  };

  const forceReconnect = (): void => {
    if (closed) return;
    generation += 1;
    controller?.abort();
    controller = null;
    store.connection = 'reconnecting';
    scheduleRetry(true);
  };

  const watchdog = setInterval(() => {
    if (closed) return;
    const now = Date.now();

    if (lastByteAt > 0 && now - lastByteAt > STALL_ABORT_MS) {
      lastByteAt = now;
      forceReconnect();
      return;
    }

    if (store.lastFrameAt === 0) return;
    const age = now - store.lastFrameAt;
    if (age > STALE_AFTER_MS) store.connection = 'stale';
    else if (age > AMBER_AFTER_MS && store.connection === 'live') store.connection = 'reconnecting';
  }, 500);

  const handleFrame = (eventName: string, data: string): void => {
    if (eventName === 'bye') {
      forceReconnect();
      return;
    }
    if (eventName !== 'snapshot' && eventName !== 'frame') return;
    try {
      if (eventName === 'snapshot') {
        const snap = JSON.parse(data) as SnapshotDTO;
        if (snap.seq < store.seq) {
          store.maxEventId = 0;
          store.ticker = [];
          motion.fx.length = 0;
        }
        motion.legs.clear();
        store.applySnapshot(snap);
      } else {
        const frame = JSON.parse(data) as FrameDTO;
        if (applyFrame(store, motion, frame) === 'gap') {
          forceReconnect();
          return;
        }
      }
      store.connection = 'live';
      store.retryInSec = 0;
      attempt = 0;
    } catch {
      store.connection = 'reconnecting';
    }
  };

  const open = async (): Promise<void> => {
    if (closed) return;
    const myGeneration = ++generation;
    controller = new AbortController();
    const signal = controller.signal;
    if (store.connection !== 'live') store.connection = 'connecting';
    lastByteAt = Date.now();

    try {
      const response = await fetch(`${streamUrl}?since=${store.seq}`, {
        signal,
        headers: { Accept: 'text/event-stream' },
        cache: 'no-store',
      });
      if (!response.ok || !response.body) throw new Error(`stream ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (closed || myGeneration !== generation) {
          void reader.cancel().catch(() => undefined);
          return;
        }
        if (done) break;
        lastByteAt = Date.now();
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 4_000_000) buffer = '';

        let split = buffer.indexOf('\n\n');
        while (split !== -1) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          let eventName = 'message';
          let data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            else if (line.startsWith('data: ')) data += line.slice(6);
          }
          if (data) handleFrame(eventName, data);
          split = buffer.indexOf('\n\n');
        }
      }
      if (!closed && myGeneration === generation) {
        store.connection = 'reconnecting';
        scheduleRetry();
      }
    } catch {
      if (!closed && myGeneration === generation) {
        store.connection = store.lastFrameAt === 0 ? 'offline' : 'reconnecting';
        scheduleRetry();
      }
    }
  };

  void open();

  const onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      generation += 1;
      controller?.abort();
      controller = null;
    } else if (!closed) {
      attempt = 0;
      scheduleRetry(true);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    close(): void {
      closed = true;
      clearInterval(watchdog);
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      generation += 1;
      controller?.abort();
      controller = null;
    },
  };
}
