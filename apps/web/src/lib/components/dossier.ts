export interface TraitMeaning {
  label: string;
  blurb: string;
}

export const TRAIT_MEANINGS: Record<string, TraitMeaning> = {
  greedy: { label: 'Greedy', blurb: 'Reads the ledger before the last rites.' },
  craven: { label: 'Craven', blurb: 'First to the stairs, every time, on principle.' },
  bold: { label: 'Bold', blurb: 'Signs the waiver without turning the page.' },
  vengeful: { label: 'Vengeful', blurb: 'Keeps a grudge in triplicate.' },
  loyal: { label: 'Loyal', blurb: 'Will drag a colleague home unpaid.' },
  reckless: { label: 'Reckless', blurb: 'Considers hazard pay a personal challenge.' },
  cautious: { label: 'Cautious', blurb: 'Has never once opened a door first.' },
  pious: { label: 'Pious', blurb: 'Tithes to something that has not confirmed receipt.' },
  lucky: { label: 'Lucky', blurb: 'Survives on a technicality most weeks.' },
  glory_hound: { label: 'Glory Hound', blurb: 'Wants the plaque more than the payout.' },
  hoarder: { label: 'Hoarder', blurb: 'Banks nothing, carries everything, dies rich.' },
  superstitious: { label: 'Superstitious', blurb: 'Will not delve on an odd tick.' },
};

export function traitMeaning(id: string): TraitMeaning {
  const known = TRAIT_MEANINGS[id];
  if (known) return known;
  const label = id
    .split('_')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
  return { label, blurb: 'An entry the clerks never filed.' };
}

export const RARITY_CHIP: Record<string, string> = {
  common: 'border-dossier-rule text-stone-600',
  uncommon: 'border-poison-700/45 text-poison-700',
  rare: 'border-arcane-700/45 text-arcane-700',
  epic: 'border-torch-700/55 text-torch-700 bg-torch-100/50',
  legendary: 'border-blood-700/55 text-blood-700 bg-parchment-200',
};

export function rarityChip(rarity: string): string {
  return RARITY_CHIP[rarity] ?? RARITY_CHIP['common']!;
}

export const HISTORY_GLYPH: Record<string, string> = {
  formed: '§',
  descend: '↓',
  wipe: '☠',
  record: '★',
  rank: '▲',
  disband: '✕',
  boss: '⚔',
  haul: '◈',
};

export const HISTORY_TONE: Record<string, string> = {
  formed: 'text-stone-600',
  descend: 'text-arcane-700',
  wipe: 'text-blood-700',
  record: 'text-torch-700',
  rank: 'text-poison-700',
  disband: 'text-stone-600',
  boss: 'text-blood-700',
  haul: 'text-parchment-700',
};

export function historyGlyph(kind: string): string {
  return HISTORY_GLYPH[kind] ?? '·';
}

export function historyTone(kind: string): string {
  return HISTORY_TONE[kind] ?? 'text-stone-600';
}

export function coin(cp: number): string {
  return `${Math.round(cp).toLocaleString()}cp`;
}

export function standingWord(standing: number): string {
  if (standing >= 60) return 'favoured';
  if (standing >= 20) return 'tolerated';
  if (standing > -20) return 'unremarked';
  if (standing > -60) return 'resented';
  return 'marked';
}

export function greedWord(greed: number): string {
  if (greed >= 1.2) return 'rapacious';
  if (greed >= 0.85) return 'grasping';
  if (greed >= 0.5) return 'businesslike';
  return 'frugal';
}

export function rationsWord(rations: number): string {
  if (rations >= 30) return 'well fed';
  if (rations >= 15) return 'thinning';
  if (rations > 0) return 'scraping';
  return 'starving';
}

export function hpTone(pct: number): string {
  if (pct > 50) return 'bg-poison-400';
  if (pct > 25) return 'bg-torch-400';
  return 'bg-blood-400';
}

export function xpSpent(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += Math.round(60 * l ** 1.45);
  return total;
}

export function relationWord(v: number): string {
  const m = Math.abs(v);
  if (v > 0) {
    if (m >= 70) return 'sworn';
    if (m >= 35) return 'close';
    return 'friendly';
  }
  if (m >= 70) return 'blood feud';
  if (m >= 35) return 'bitter';
  return 'sour';
}
