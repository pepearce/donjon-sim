import type { SimEvent } from '@donjon/shared';
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
  bornTick: number;
  diedTick: number | null;
  diedWallMs: number | null;
  goldCp: number;
  items: number[];
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
  restUntilTick: number;
  lastDeepestTick: number;
  explored: Set<string>;
  exploredTiles: Map<number, Uint8Array>;
  trail: Array<[number, number]>;
}

export function exploredKey(floorId: number, roomIdx: number): string {
  return `${floorId}:${roomIdx}`;
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
  mintedCp: number;
  sinkCp: number;
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
  initialCoinCp: number;
  pendingEvents: SimEvent[];
  tailRing: RingBuffer<SimEvent>;
}

export function statMod(value: number): number {
  return Math.floor((value - 10) / 2);
}

export function clamp(lo: number, hi: number, value: number): number {
  return Math.min(hi, Math.max(lo, value));
}

export function xpToNext(level: number): number {
  return Math.round(60 * level ** 1.45);
}

export const MAX_LEVEL = 20;
export const BLEED_OUT_TICKS = 8;
