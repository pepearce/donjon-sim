import type { EventType, Severity } from './events.js';

export const PROTOCOL_VERSION = 1;

export interface ServerInfo {
  simVersion: string;
  protocol: number;
  tickMs: number;
  speed: number;
  epoch: string;
}

export interface WorldPublic {
  tick: number;
  day: number;
  watch: string;
  seed: number;
  status: string;
}

export interface RoomPublic {
  id: number;
  idx: number;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  title: string;
  deaths: number;
}

export interface FloorMapDTO {
  id: number;
  depth: number;
  name: string;
  width: number;
  height: number;
  tiles: string;
  rooms: RoomPublic[];
  entryRoom: number;
  stairsRoom: number;
  hearthRoom: number;
  shopRoom: number;
}

export interface FloorIndexEntry {
  id: number;
  depth: number;
  name: string;
  roomCount: number;
  teamCount: number;
  discovered: boolean;
}

export type HeroLine = 'front' | 'back';

export type HeroStateDTO = 'ok' | 'downed' | 'dead';

export interface HeroPublic {
  id: number;
  name: string;
  species: string;
  className: string;
  level: number;
  hp: number;
  hpMax: number;
  alive: boolean;
  line: HeroLine;
  state: HeroStateDTO;
  kills: number;
  traits: string[];
  epithet: string;
  nemesis: string;
  scarred: boolean;
}

export interface TeamPublic {
  id: number;
  name: string;
  motto: string;
  monogram: string;
  colorIndex: number;
  state: string;
  floorId: number;
  roomIdx: number;
  roomName: string;
  morale: number;
  goldCp: number;
  roomsExplored: number;
  standing: number;
  renown: number;
  deepestFloor: number;
  carriedCp: number;
  heroes: HeroPublic[];
}

export interface TokenPublic {
  id: number;
  floorId: number;
  x: number;
  y: number;
  trail: Array<[number, number]>;
  colorIndex: number;
  monogram: string;
  hp: number;
  alive: number;
  flags: number;
}

export interface MonsterPublic {
  id: number;
  floorId: number;
  roomIdx: number;
  x: number;
  y: number;
  name: string;
  kindId: string;
  cr: number;
  hp: number;
  hpMax: number;
  guardian: boolean;
}

export interface EventDTO {
  id: number;
  tick: number;
  type: EventType;
  severity: Severity;
  teamId: number | null;
  heroId: number | null;
  roomId: number | null;
  text: string;
}

export interface KeeperSchemePublic {
  id: number;
  kind: string;
  name: string;
  teamId: number;
  teamName: string;
  goal: number;
  progress: number;
  startedTick: number;
  deadlineTick: number;
  daysLeft: number;
}

export interface RecordRowDTO {
  kind: string;
  label: string;
  value: number;
  holder: string;
  teamName: string;
  tick: number;
}

export interface KeeperPublic {
  treasuryCp: number;
  loanCp: number;
  austerity: boolean;
  mood: string;
  aggression: number;
  entryFeeCp: number;
  tollBp: number;
  corpseTaxBp: number;
  heroesSlain: number;
  staff: number;
  fame: number;
  notoriety: number;
  decree: string;
  lastAct: string;
  lastActText: string;
  lastActTick: number;
  scheme: KeeperSchemePublic | null;
  records: RecordRowDTO[];
}

export interface HeroRelationDTO {
  id: number;
  name: string;
  v: number;
}

export interface HeroItemDTO {
  name: string;
  rarity: string;
  valueCp: number;
  atk: number;
  def: number;
  dr: number;
}

export interface HeroDetailDTO extends HeroPublic {
  xp: number;
  xpToNext: number;
  stats: { str: number; agi: number; wil: number };
  bornTick: number;
  relations: HeroRelationDTO[];
  nemesisDowns: number;
  items: HeroItemDTO[];
  goldCp: number;
}

export interface TeamHistoryDTO {
  t: number;
  k: string;
  s: string;
}

export interface TeamDetailDTO {
  id: number;
  name: string;
  motto: string;
  standing: number;
  greed: number;
  rations: number;
  carriedCp: number;
  formedTick: number;
  history: TeamHistoryDTO[];
  heroes: HeroDetailDTO[];
}

export interface LeaderboardRowDTO {
  rank: number;
  teamId: number;
  name: string;
  monogram: string;
  colorIndex: number;
  renown: number;
  deepestFloor: number;
  goldCp: number;
  alive: number;
  state: string;
}

export interface MemorialEntryDTO {
  id: number;
  name: string;
  species: string;
  className: string;
  level: number;
  diedTick: number;
  kills: number;
  teamName: string;
}

export interface SnapshotDTO {
  v: number;
  epoch: string;
  seq: number;
  tick: number;
  ts: number;
  dt: number;
  world: WorldPublic;
  floors: FloorIndexEntry[];
  teams: TeamPublic[];
  tokens: TokenPublic[];
  events: EventDTO[];
  casualties: number;
  keeper: KeeperPublic;
  leaderboard: LeaderboardRowDTO[];
  memorial: MemorialEntryDTO[];
  heroesLiving: number;
  tavernSize: number;
  monsters: MonsterPublic[];
}

export type MoveLeg = [number, number, number, number, number, number];

export type Op =
  | { o: 'tok+'; t: TokenPublic }
  | { o: 'tok-'; id: number }
  | { o: 'team'; id: number; p: Partial<TeamPublic> }
  | { o: 'team+'; t: TeamPublic }
  | { o: 'team-'; id: number }
  | { o: 'mv'; id: number; f: number; legs: MoveLeg[] }
  | { o: 'warp'; id: number; f: number; x: number; y: number }
  | { o: 'ev'; e: EventDTO }
  | { o: 'keeper'; p: Partial<KeeperPublic> }
  | { o: 'lb'; rows: LeaderboardRowDTO[] }
  | { o: 'mem'; rows: MemorialEntryDTO[] }
  | { o: 'floor'; rows: FloorIndexEntry[] }
  | { o: 'cnt'; casualties: number; heroesLiving: number; tavernSize: number }
  | { o: 'mon'; rows: MonsterPublic[] };

export interface FrameDTO {
  v: number;
  seq: number;
  tick: number;
  from: number;
  ts: number;
  dt: number;
  ops: Op[];
}

export interface BootstrapDTO {
  server: ServerInfo;
  snapshot: SnapshotDTO;
  cursor: number;
  streamUrl: string;
}
