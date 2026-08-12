export const TEAM_COLORS = [
  '#DE4F11',
  '#C5B204',
  '#BDFC18',
  '#5FEF91',
  '#73F6D5',
  '#33F7FC',
  '#3DC2FC',
  '#8D6EFE',
  '#A46AA9',
  '#F384BD',
] as const;

export const TEAM_COLOR_NAMES = [
  'vermilion',
  'brass',
  'bile',
  'moss',
  'verdigris',
  'glacier',
  'azure',
  'arcane',
  'mauve',
  'rose',
] as const;

export type TokenShape = 'circle' | 'diamond' | 'square' | 'triangle-up' | 'hexagon' | 'triangle-down';

export const TEAM_SHAPES: TokenShape[] = [
  'circle',
  'diamond',
  'square',
  'triangle-up',
  'hexagon',
  'circle',
  'diamond',
  'square',
  'triangle-down',
  'hexagon',
];

export const MAP_PALETTE = {
  unexplored: '#0B0908',
  wallInk: '#050403',
  wall: '#1F1A15',
  floor: '#4A4034',
  floorAlt: '#554839',
  rubble: '#3E362A',
  hazard: '#2B4F5C',
  trap: '#A32E22',
  door: '#8E7466',
  stairs: '#A99C86',
  wallFace: '#211C15',
  wallMid: '#16120E',
  wallDeep: '#0F0C09',
  wallMortar: '#0F0C09',
  wallLip: '#6B5A44',
  wallShade: 'rgba(5, 4, 3, 0.55)',
  doorFrame: '#4A382C',
  stairsInk: '#5E5443',
  label: '#F5E7C2',
  labelInk: 'rgba(5, 4, 3, 0.85)',
} as const;

export const FX_PALETTE = {
  clash: '#FFBE4D',
  blood: '#E64F3E',
  death: '#D6301F',
  loot: '#FFD879',
  level: '#BDFC18',
  descend: '#73F6D5',
  record: '#FFCE5C',
  trap: '#FF8A3D',
  disarm: '#33F7FC',
  cleared: '#F5E7C2',
  landmark: '#C7A3F7',
  monster: '#E64F3E',
  guardian: '#B892F1',
} as const;

function channels(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function mixColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

export function teamColor(colorIndex: number): string {
  return TEAM_COLORS[colorIndex % TEAM_COLORS.length] ?? TEAM_COLORS[0];
}

export function teamShape(colorIndex: number): TokenShape {
  return TEAM_SHAPES[colorIndex % TEAM_SHAPES.length] ?? 'circle';
}
