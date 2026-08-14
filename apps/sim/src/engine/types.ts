import type { Rng, SimEvent } from '@donjon/shared';
import type { RingBuffer } from './ring.js';
import type { Scheduler } from './scheduler.js';

export type TeamState = 'recruiting' | 'delving' | 'fighting' | 'fleeing' | 'resting' | 'disbanded';
export type HeroState = 'ok' | 'downed' | 'dead';
export type RoomState = 'stocked' | 'cleared' | 'restocking';
export type TrapState = 'none' | 'armed' | 'sprung' | 'disarmed';
export type Rarity = 0 | 1 | 2 | 3 | 4;

export const RARITY_NAMES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export const RARITY_BASE_CP = [40, 220, 1100, 6000, 30000] as const;

export const TILE_WALL = 0;
export const TILE_FLOOR = 1;
export const TILE_DOOR = 2;
export const TILE_STAIRS = 3;
export const TILE_RUBBLE = 4;
export const TILE_HEARTH = 5;
export const TILE_SHOP = 6;

export function isWalkable(
  floor: { width: number; height: number; tiles: Uint8Array },
  x: number,
  y: number,
): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x >= floor.width || y >= floor.height) return false;
  return (floor.tiles[y * floor.width + x] ?? TILE_WALL) !== TILE_WALL;
}

export interface Stats {
  str: number;
  agi: number;
  wil: number;
}

export interface Item {
  id: number;
  name: string;
  rarity: Rarity;
  valueCp: number;
  atk: number;
  def: number;
  dr: number;
  ownerHeroId: number | null;
  ownerTeamId: number | null;
  roomId: number | null;
}

export interface Hero {
  id: number;
  name: string;
  species: string;
  className: string;
  primary: keyof Stats;
  teamId: number | null;
  level: number;
  xp: number;
  hp: number;
  hpMax: number;
  stats: Stats;
  state: HeroState;
  bleedOutTick: number;
  kills: number;
  scarred: boolean;
  rezCount: number;
  bornTick: number;
  diedTick: number | null;
  diedWallMs: number | null;
  retiredTick: number | null;
  goldCp: number;
  items: number[];
  traits: string[];
  epithet: string;
  nemesisName: string;
  nemesisDowns: number;
  relations: Array<{ id: number; v: number }>;
}

export interface Monster {
  id: number;
  name: string;
  cr: number;
  hp: number;
  hpMax: number;
  atk: number;
  def: number;
  dr: number;
  dmgSides: number;
  dmgBonus: number;
  xp: number;
  wageCpPerDay: number;
  roomId: number;
  floorId: number;
  guardian: boolean;
  apex: boolean;
  alive: boolean;
}

export interface Room {
  id: number;
  floorId: number;
  idx: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  state: RoomState;
  lootCp: number;
  trapTier: number;
  trapState: TrapState;
  restockDueTick: number;
  visits: number;
  deaths: number;
}

export interface Floor {
  id: number;
  depth: number;
  name: string;
  width: number;
  height: number;
  tiles: Uint8Array;
  rooms: Room[];
  adjacency: number[][];
  nextHop: Uint8Array;
  dist: Uint8Array;
  entryRoom: number;
  stairsRoom: number;
  hearthRoom: number;
  shopRoom: number;
  dangerCr: number;
  generatedTick: number;
}

export interface Team {
  id: number;
  name: string;
  motto: string;
  colorIndex: number;
  monogram: string;
  state: TeamState;
  floorId: number;
  roomIdx: number;
  targetRoom: number;
  tileX: number;
  tileY: number;
  path: Array<[number, number]>;
  pathPos: number;
  roster: number[];
  morale: number;
  goldCp: number;
  carriedCp: number;
  rations: number;
  greed: number;
  renownMilli: number;
  peakRenownMilli: number;
  rank: number;
  deepestFloor: number;
  lastAction: string;
  commitUntilTick: number;
  formedTick: number;
  disbandedTick: number | null;
  homeboundTick: number | null;
  restUntilTick: number;
  lastDeepestTick: number;
  explored: Set<string>;
  exploredTiles: Map<number, Uint8Array>;
  trail: Array<[number, number]>;
  history: Array<{ t: number; k: string; s: string }>;
  standing: number;
}

export function exploredKey(floorId: number, roomIdx: number): string {
  return `${floorId}:${roomIdx}`;
}

export interface KeeperScheme {
  id: number;
  kind: string;
  targetTeamId: number;
  name: string;
  goal: number;
  progress: number;
  startedTick: number;
  deadlineTick: number;
  outcome: string;
}

export interface KeeperGambit {
  stakeCp: number;
  targetCp: number;
  collectedCp: number;
  startedTick: number;
  endsTick: number;
}

export interface KeeperActState {
  last: string;
  tick: number;
  text: string;
  cooldowns: Record<string, number>;
}

export interface RecordEntry {
  kind: string;
  label: string;
  value: number;
  holder: string;
  teamName: string;
  tick: number;
}

export interface DungeonState {
  treasuryCp: number;
  loanCp: number;
  austerity: boolean;
  aggressionMilli: number;
  lethalityEmaMilli: number;
  revenueEmaCp: number;
  fameMilli: number;
  notorietyMilli: number;
  entryFeeCp: number;
  tollBp: number;
  corpseTaxBp: number;
  keeperMood: string;
  heroesSlain: number;
  corpseYieldCp: number;
  rezYieldCp: number;
  mintedCp: number;
  sinkCp: number;
  scheme: KeeperScheme | null;
  keeperAct: KeeperActState;
  records: RecordEntry[];
  insolventDays: number;
  keeperName: string;
  keeperTrait: string;
  standing: number;
  overseerName: string;
  gambit: KeeperGambit | null;
  lastGambitEndedTick: number;
  loanTakenTick: number;
  lastBigHaulTeamId: number | null;
  apexEpoch: number;
  lastTriumphTick: number;
}

export interface World {
  seed: number;
  tick: number;
  floors: Floor[];
  teams: Team[];
  heroes: Hero[];
  monsters: Monster[];
  items: Item[];
  tavern: number[];
  dungeon: DungeonState;
  scheduler: Scheduler;
  nextEventId: number;
  nextHeroId: number;
  nextTeamId: number;
  nextMonsterId: number;
  nextItemId: number;
  nextSchemeId: number;
  initialCoinCp: number;
  pendingEvents: SimEvent[];
  tailRing: RingBuffer<SimEvent>;
  foreclosed: boolean;
}

export function statMod(value: number): number {
  return Math.floor((value - 10) / 2);
}

export function clamp(lo: number, hi: number, value: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function pickWeighted<T>(items: T[], weights: number[], rng: Rng): T | undefined {
  const total = weights.reduce((a, b) => a + b, 0);
  let point = rng.float() * total;
  let picked = items[0];
  for (let i = 0; i < items.length; i++) {
    point -= weights[i] ?? 0;
    if (point <= 0) {
      picked = items[i];
      break;
    }
  }
  return picked;
}

export function xpToNext(level: number): number {
  return Math.round(60 * level ** 1.45);
}

export const MAX_LEVEL = 20;
export const BLEED_OUT_TICKS = 8;
export const MAX_TRAITS = 2;
export const MAX_RELATIONS = 6;
export const MAX_HISTORY = 20;

export function addRelation(hero: Hero, otherId: number, delta: number): number {
  const existing = hero.relations.find((r) => r.id === otherId);
  if (existing) {
    existing.v = clamp(-100, 100, existing.v + delta);
    return existing.v;
  }
  const v = clamp(-100, 100, delta);
  hero.relations.push({ id: otherId, v });
  hero.relations.sort((a, b) => a.id - b.id);
  while (hero.relations.length > MAX_RELATIONS) {
    let worst = 0;
    for (let i = 1; i < hero.relations.length; i++) {
      const cur = hero.relations[i];
      const best = hero.relations[worst];
      if (!cur || !best) continue;
      if (Math.abs(cur.v) < Math.abs(best.v)) worst = i;
    }
    hero.relations.splice(worst, 1);
  }
  return v;
}

export function relationTo(hero: Hero, otherId: number): number {
  for (const r of hero.relations) {
    if (r.id === otherId) return r.v;
  }
  return 0;
}

export function pushHistory(team: Team, tick: number, kind: string, sentence: string): void {
  team.history.push({ t: tick, k: kind, s: sentence });
  while (team.history.length > MAX_HISTORY) team.history.shift();
}

export function roomTitle(room: Room): string {
  if (room.deaths >= 8) return 'the Abattoir';
  if (room.deaths >= 5) return "the Butcher's Rest";
  if (room.deaths >= 3) return 'the Unlucky';
  if (room.visits >= 40 && room.deaths === 0) return 'the Well-Trodden';
  return '';
}
