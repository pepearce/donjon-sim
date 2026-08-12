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
  floor: '#332D26',
  floorAlt: '#3A332B',
  rubble: '#4A4234',
  hazard: '#2B4F5C',
  trap: '#A32E22',
  door: '#8E7466',
  stairs: '#A99C86',
} as const;

export function teamColor(colorIndex: number): string {
  return TEAM_COLORS[colorIndex % TEAM_COLORS.length] ?? TEAM_COLORS[0];
}

export function teamShape(colorIndex: number): TokenShape {
  return TEAM_SHAPES[colorIndex % TEAM_SHAPES.length] ?? 'circle';
}
