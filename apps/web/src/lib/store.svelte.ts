import { getContext, setContext } from 'svelte';
import type {
  BootstrapDTO,
  EventDTO,
  FloorIndexEntry,
  FloorMapDTO,
  KeeperPublic,
  LeaderboardRowDTO,
  MemorialEntryDTO,
  MonsterPublic,
  SnapshotDTO,
  TeamPublic,
  TokenPublic,
} from '@donjon/shared';

import type { MotionState } from './applyFrame.js';

const KEY = Symbol('donjon.sim');
const MOTION_KEY = Symbol('donjon.motion');

export function setMotion(motion: MotionState): void {
  setContext(MOTION_KEY, motion);
}

export function useMotion(): MotionState | undefined {
  return getContext<MotionState | undefined>(MOTION_KEY);
}

export type ConnectionState = 'connecting' | 'live' | 'reconnecting' | 'stale' | 'offline';

export const TICKER_CAPACITY = 200;

export class SimStore {
  tick = $state(0);
  day = $state(0);
  watch = $state('POTRON_MINET');
  seq = $state(0);
  dt = $state(1000);
  frameTs = $state(0);
  casualties = $state(0);

  teams = $state<TeamPublic[]>([]);
  tokens = $state<TokenPublic[]>([]);
  ticker = $state<EventDTO[]>([]);
  floorMap = $state<FloorMapDTO | null>(null);
  floors = $state<FloorIndexEntry[]>([]);
  leaderboard = $state.raw<LeaderboardRowDTO[]>([]);
  memorial = $state.raw<MemorialEntryDTO[]>([]);
  keeper = $state<KeeperPublic | null>(null);
  heroesLiving = $state(0);
  tavernSize = $state(0);
  selectedFloor = $state(1);
  selectedTeam = $state<number | null>(null);
  selectedHero = $state<number | null>(null);
  autoSelect = $state(false);
  drawerOpen = $state(false);
  director = $state(false);
  follow = $state(false);
  playbackTick = $state(0);
  fog = $state<Record<string, number[]> | null>(null);
  sight = $state<number[]>([]);
  fogTiles = $state.raw<Record<string, string>>({});
  monsters = $state.raw<MonsterPublic[]>([]);

  connection = $state<ConnectionState>('connecting');
  lastFrameAt = $state(0);
  retryInSec = $state(0);
  epoch = $state('');
  speed = $state(1);

  maxEventId = 0;

  get isStale(): boolean {
    return this.connection === 'stale' || this.connection === 'offline';
  }

  get heroesAlive(): number {
    return this.teams.reduce((n, t) => n + t.heroes.filter((h) => h.alive).length, 0);
  }

  get selectedTeamData(): TeamPublic | null {
    if (this.selectedTeam === null) return null;
    return this.teams.find((t) => t.id === this.selectedTeam) ?? null;
  }

  applyBootstrap(boot: BootstrapDTO): void {
    this.epoch = boot.server.epoch;
    this.speed = boot.server.speed;
    this.applySnapshot(boot.snapshot);
  }

  applySnapshot(snap: SnapshotDTO): void {
    if (snap.epoch && this.epoch !== '' && snap.epoch !== this.epoch) {
      this.floorMap = null;
      this.fog = null;
      this.sight = [];
      this.fogTiles = {};
    }
    if (snap.epoch) this.epoch = snap.epoch;
    this.tick = snap.tick;
    this.day = snap.world.day;
    this.watch = snap.world.watch;
    this.seq = snap.seq;
    this.dt = snap.dt;
    if (snap.dt > 0) this.speed = Math.round((1000 / snap.dt) * 100) / 100;
    this.frameTs = snap.ts;
    this.casualties = snap.casualties;
    this.teams = snap.teams;
    this.tokens = snap.tokens;
    this.floors = snap.floors;
    this.leaderboard = snap.leaderboard;
    this.memorial = snap.memorial;
    this.keeper = snap.keeper;
    this.heroesLiving = snap.heroesLiving;
    this.tavernSize = snap.tavernSize;
    this.monsters = snap.monsters ?? [];
    this.lastFrameAt = Date.now();

    const fresh = snap.events.filter((e) => e.id > this.maxEventId);
    if (fresh.length > 0) {
      this.maxEventId = fresh[fresh.length - 1]?.id ?? this.maxEventId;
      const merged = [...this.ticker, ...fresh];
      this.ticker = merged.slice(Math.max(0, merged.length - TICKER_CAPACITY));
    }
  }
}

export function createSimStore(): SimStore {
  const store = new SimStore();
  setContext(KEY, store);
  return store;
}

export function useSim(): SimStore {
  const store = getContext<SimStore | undefined>(KEY);
  if (!store) throw new Error('SimStore is not in context');
  return store;
}
