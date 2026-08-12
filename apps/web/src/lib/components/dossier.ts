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

export interface ClassMeaning {
  label: string;
  blurb: string;
  role: string;
  act: string;
  actBlurb: string;
}

export const CLASS_MEANINGS: Record<string, ClassMeaning> = {
  sabreur: {
    label: 'Sabreur',
    blurb: 'Duellist on retainer. High attack, thin patience.',
    role: 'trades cuts up front; a kill buys a second swing',
    act: 'Second cut',
    actBlurb: 'When their blow fells a monster, they strike another target the same round.',
  },
  thaumaturge: {
    label: 'Thaumaturge',
    blurb: 'Licensed caster. Frail, and billed per target.',
    role: 'works from the back; damage arcs to a second enemy',
    act: 'Arc',
    actBlurb: 'Against two or more enemies, their hit splashes half damage onto another.',
  },
  sapper: {
    label: 'Sapper',
    blurb: 'Demolitions and doors. Reads traps like invoices.',
    role: 'opens the fight with a charge and defuses the traps',
    act: 'Charge',
    actBlurb: 'When combat starts they blast every enemy in the room. Also far better at disarming traps.',
  },
  cutpurse: {
    label: 'Cutpurse',
    blurb: 'Contract acquisition specialist. Fast hands.',
    role: 'fights near the front and settles each kill in cash',
    act: 'Skim',
    actBlurb: 'Every kill puts a little extra copper straight into the team purse.',
  },
  bruiser: {
    label: 'Bruiser',
    blurb: 'Load-bearing colleague. Slow to fall, hard to move.',
    role: 'holds the front line and eats blows meant for the back',
    act: 'Hold the line',
    actBlurb: 'May intercept an attack aimed at a back-line colleague, taking it on their own armour.',
  },
  pretre: {
    label: 'Prêtre',
    blurb: 'Chaplain and field medic. Someone has to file the rites.',
    role: 'stays in the back and keeps the others breathing',
    act: 'Last rites',
    actBlurb: 'Spends their turn reviving the fallen or healing the worst-hurt instead of attacking.',
  },
};

export function classMeaning(id: string): ClassMeaning {
  return (
    CLASS_MEANINGS[id] ?? {
      label: id,
      blurb: 'A trade the clerks never classified.',
      role: 'does something unrecorded',
      act: 'Unknown',
      actBlurb: 'Whatever it is, it has not been observed twice.',
    }
  );
}

export const SPECIES_MEANINGS: Record<string, TraitMeaning> = {
  duck: { label: 'Duck', blurb: 'Quick and shrill. Agile, not sturdy.' },
  toad: { label: 'Toad', blurb: 'Damp and patient. Strong-willed.' },
  mole: { label: 'Mole', blurb: 'Knows soil, distrusts daylight. Solid.' },
  ferret: { label: 'Ferret', blurb: 'Fastest thing on the payroll, and the frailest.' },
  boar: { label: 'Boar', blurb: 'All shoulder. Hits doors, walls, deadlines.' },
  crow: { label: 'Crow', blurb: 'Clever, light, remembers everything.' },
  rabbit: { label: 'Rabbit', blurb: 'Nervy and quick. Leaves first, usually rightly.' },
  lizard: { label: 'Lizard', blurb: 'Even-tempered and even-statted.' },
  badger: { label: 'Badger', blurb: 'Stubborn muscle with opinions.' },
  cat: { label: 'Cat', blurb: 'Agile, self-employed even while employed.' },
};

export function speciesMeaning(id: string): TraitMeaning {
  return SPECIES_MEANINGS[id] ?? { label: id, blurb: 'An unregistered lineage.' };
}

export function fightLine(hero: { className: string; line: string }): string {
  const cls = classMeaning(hero.className);
  const stance = hero.line === 'front' ? 'Stands in the front line' : 'Works from the back line';
  return `${stance}; ${cls.role}.`;
}

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
