import type { Stats } from './types.js';

export interface SpeciesRow {
  id: string;
  name: string;
  stats: Stats;
  hp: number;
}

export interface ClassRow {
  id: string;
  name: string;
  primary: keyof Stats;
  hp: number;
  atk: number;
  def: number;
}

export const SPECIES: SpeciesRow[] = [
  { id: 'duck', name: 'duck', stats: { str: 9, agi: 13, wil: 11 }, hp: 10 },
  { id: 'toad', name: 'toad', stats: { str: 11, agi: 9, wil: 13 }, hp: 11 },
  { id: 'mole', name: 'mole', stats: { str: 12, agi: 10, wil: 10 }, hp: 12 },
  { id: 'ferret', name: 'ferret', stats: { str: 9, agi: 14, wil: 10 }, hp: 9 },
  { id: 'boar', name: 'boar', stats: { str: 14, agi: 8, wil: 10 }, hp: 14 },
  { id: 'crow', name: 'crow', stats: { str: 9, agi: 12, wil: 13 }, hp: 9 },
  { id: 'rabbit', name: 'rabbit', stats: { str: 10, agi: 13, wil: 9 }, hp: 10 },
  { id: 'lizard', name: 'lizard', stats: { str: 11, agi: 12, wil: 10 }, hp: 11 },
  { id: 'badger', name: 'badger', stats: { str: 13, agi: 9, wil: 11 }, hp: 13 },
  { id: 'cat', name: 'cat', stats: { str: 10, agi: 14, wil: 11 }, hp: 10 },
];

export const CLASSES: ClassRow[] = [
  { id: 'sabreur', name: 'sabreur', primary: 'str', hp: 4, atk: 2, def: 1 },
  { id: 'thaumaturge', name: 'thaumaturge', primary: 'wil', hp: 1, atk: 2, def: 0 },
  { id: 'sapper', name: 'sapper', primary: 'agi', hp: 3, atk: 1, def: 2 },
  { id: 'cutpurse', name: 'cutpurse', primary: 'agi', hp: 2, atk: 2, def: 1 },
  { id: 'bruiser', name: 'bruiser', primary: 'str', hp: 6, atk: 1, def: 2 },
  { id: 'pretre', name: 'pretre', primary: 'wil', hp: 3, atk: 0, def: 1 },
];

export const GIVEN_NAMES = [
  'Palmyre', 'Bref', 'Ida', 'Ludo', 'Grogro', 'Anselme', 'Zeni', 'Marvin', 'Horus', 'Alcibiade',
  'Pipette', 'Grombo', 'Ysengrin', 'Colette', 'Barnab', 'Vaucanson', 'Ombeline', 'Truffe',
  'Gastonnet', 'Merlu', 'Sidonie', 'Roquette', 'Belial', 'Pistou', 'Nesle', 'Tourbe',
  'Cambouis', 'Elzevir', 'Fenouil', 'Guimauve', 'Aubin', 'Berthe', 'Clovis', 'Delphine',
  'Eustache', 'Fantine', 'Gaspard', 'Hersende', 'Isidore', 'Jacinthe', 'Kervran', 'Lisette',
  'Mathurin', 'Nicaise', 'Odilon', 'Perrine', 'Quentin', 'Raoulette', 'Sylvestre', 'Thibaut',
];

export const SURNAMES = [
  'Quackson', 'Vasse', 'of the Ninth', 'Bec-de-Fer', 'Sanslesou', 'Malebranche', 'du Fosse',
  'Trois-Doigts', 'la Rancune', 'Boitout', 'de Gehenne', 'Croquemitaine', 'Sansdette',
  'le Bref', 'Vielleville', 'Rouille', 'Pattemolle', 'Grisefosse', 'Tord-Boyaux',
  'de la Fauche', 'Sansgage', 'Culdesac', 'Maltournee', 'Brisefer', 'Courtepatte',
  'Vide-Gousset', 'Pleurenlit', 'Sansfacon', 'Baisemain', 'Trempeloeil', 'Bonnefoi',
  'Sanschagrin', 'Tirelire', 'Fendlaire', 'Grattepain', 'Doucemine',
];

export const TEAM_PREFIXES = [
  'The Ninth', 'The Bone', 'The Damp', 'The Gilded', 'The Provisional', 'The Unpaid',
  'The Reckless', 'The Second-Best', 'The Bankrupt', 'The Devout', 'The Hungry', 'The Notarised',
  'The Salvaged', 'The Overdrawn', 'The Ambulant', 'The Regrettable', 'The Sundry',
  'The Uninsured', 'The Itinerant', 'The Contractual',
];

export const TEAM_SUFFIXES = [
  'Regrettables', 'Cartel', 'Concern', 'Consortium', 'Irregulars', 'Partnership', 'Company',
  'Collective', 'Syndicate', 'Delegation', 'Cooperative', 'Venture', 'Arrangement',
  'Undertaking', 'Federation', 'Association', 'Detachment', 'Fellowship',
];

export const TEAM_MOTTOS = [
  'We have read the waiver.',
  'Volume discounts on grief.',
  'Paid in advance, buried in arrears.',
  'The gold was worth it. Probably.',
  'Nobody reads the small print twice.',
  'We bring our own stretcher.',
  'Losses are a formality.',
  'Ask about our death benefits.',
  'Deeper is cheaper, per corpse.',
  'Sponsored by nobody, obviously.',
  'Terms negotiable, outcomes less so.',
  'Three of us will come back.',
  'We do not discuss the second floor.',
  'Bonded, insured, doomed.',
  'A living wage, briefly.',
  'The Keeper knows us by name.',
  'Receipts for everything.',
  'We charge by the corridor.',
];

export interface MonsterArchetype {
  id: string;
  name: string;
  minDepth: number;
  crBias: number;
  guardian: boolean;
}

export const MONSTERS: MonsterArchetype[] = [
  { id: 'rat_clerk', name: 'rat clerk', minDepth: 1, crBias: -0.5, guardian: false },
  { id: 'goblin_intern', name: 'goblin intern', minDepth: 1, crBias: -0.3, guardian: false },
  { id: 'damp_slime', name: 'damp slime', minDepth: 1, crBias: 0, guardian: false },
  { id: 'bat_auditor', name: 'bat auditor', minDepth: 1, crBias: -0.2, guardian: false },
  { id: 'mildew_sprite', name: 'mildew sprite', minDepth: 1, crBias: -0.4, guardian: false },
  { id: 'turnstile_imp', name: 'turnstile imp', minDepth: 1, crBias: -0.1, guardian: false },
  { id: 'skeleton_temp', name: 'skeleton temp', minDepth: 2, crBias: 0.2, guardian: false },
  { id: 'rust_golem', name: 'rust golem', minDepth: 2, crBias: 0.8, guardian: false },
  { id: 'filing_wraith', name: 'filing wraith', minDepth: 2, crBias: 0.5, guardian: false },
  { id: 'cellar_newt', name: 'cellar newt', minDepth: 2, crBias: 0.1, guardian: false },
  { id: 'toll_troll', name: 'toll troll', minDepth: 3, crBias: 1.0, guardian: true },
  { id: 'spore_monk', name: 'spore monk', minDepth: 3, crBias: 0.4, guardian: false },
  { id: 'gargoyle_usher', name: 'gargoyle usher', minDepth: 3, crBias: 0.7, guardian: false },
  { id: 'candle_hound', name: 'candle hound', minDepth: 3, crBias: 0.3, guardian: false },
  { id: 'ledger_wraith', name: 'ledger wraith', minDepth: 4, crBias: 1.2, guardian: false },
  { id: 'iron_beadle', name: 'iron beadle', minDepth: 4, crBias: 1.5, guardian: true },
  { id: 'debt_collector', name: 'debt collector', minDepth: 4, crBias: 1.1, guardian: false },
  { id: 'ossuary_clerk', name: 'ossuary clerk', minDepth: 4, crBias: 0.9, guardian: false },
  { id: 'gloom_hound', name: 'gloom hound', minDepth: 5, crBias: 1.0, guardian: false },
  { id: 'vault_basilisk', name: 'vault basilisk', minDepth: 5, crBias: 2.2, guardian: true },
  { id: 'stone_notary', name: 'stone notary', minDepth: 5, crBias: 1.6, guardian: false },
  { id: 'bailiff_of_ash', name: 'bailiff of ash', minDepth: 6, crBias: 2.0, guardian: true },
  { id: 'sump_leviathan', name: 'sump leviathan', minDepth: 7, crBias: 2.6, guardian: true },
  { id: 'auditor_general', name: 'auditor general', minDepth: 8, crBias: 3.0, guardian: true },
];

export interface ItemArchetype {
  id: string;
  name: string;
  atk: number;
  def: number;
  dr: number;
}

export const ITEMS: ItemArchetype[] = [
  { id: 'sabre', name: 'notched sabre', atk: 2, def: 0, dr: 0 },
  { id: 'cudgel', name: 'tax cudgel', atk: 2, def: 0, dr: 0 },
  { id: 'buckler', name: 'dented buckler', atk: 0, def: 2, dr: 0 },
  { id: 'jerkin', name: 'mildewed jerkin', atk: 0, def: 1, dr: 1 },
  { id: 'mail', name: 'second-hand mail', atk: 0, def: 1, dr: 2 },
  { id: 'charm', name: 'dubious charm', atk: 1, def: 1, dr: 0 },
  { id: 'ring', name: 'unclaimed ring', atk: 1, def: 0, dr: 0 },
  { id: 'idol', name: 'chipped idol', atk: 0, def: 0, dr: 1 },
  { id: 'lantern', name: 'guttering lantern', atk: 0, def: 1, dr: 0 },
  { id: 'stiletto', name: 'invoice stiletto', atk: 3, def: 0, dr: 0 },
  { id: 'halberd', name: 'requisitioned halberd', atk: 3, def: 1, dr: 0 },
  { id: 'gauntlet', name: 'bailiff gauntlet', atk: 1, def: 2, dr: 1 },
  { id: 'cloak', name: 'moth-eaten cloak', atk: 0, def: 2, dr: 0 },
  { id: 'helm', name: 'ill-fitting helm', atk: 0, def: 1, dr: 2 },
  { id: 'ledger', name: 'weaponised ledger', atk: 2, def: 1, dr: 0 },
  { id: 'sling', name: 'clerk-issue sling', atk: 2, def: 0, dr: 0 },
  { id: 'brooch', name: 'notary brooch', atk: 0, def: 1, dr: 1 },
  { id: 'boots', name: 'debtor boots', atk: 0, def: 2, dr: 0 },
  { id: 'censer', name: 'cracked censer', atk: 1, def: 0, dr: 1 },
  { id: 'seal', name: 'wax seal of office', atk: 1, def: 1, dr: 0 },
  { id: 'pike', name: 'unpaid pike', atk: 3, def: 0, dr: 1 },
  { id: 'shield', name: 'estate shield', atk: 0, def: 3, dr: 1 },
  { id: 'amulet', name: 'lien amulet', atk: 2, def: 1, dr: 1 },
  { id: 'greaves', name: 'foreclosed greaves', atk: 0, def: 2, dr: 2 },
  { id: 'wand', name: 'auditor wand', atk: 3, def: 0, dr: 0 },
  { id: 'crown', name: 'repossessed crown', atk: 2, def: 2, dr: 1 },
];

export const TRAP_NAMES = [
  'a spring-loaded invoice',
  'a collapsing shelf of ledgers',
  'a pit of unpaid receipts',
  'a dart mechanism, poorly serviced',
  'a swinging turnstile',
  'a bucket of something warm',
  'a floor that bills by the step',
  'an unannounced audit',
  'a portcullis on a hair trigger',
  'a tripwire strung with bells and grudges',
  'a chute to the accounts department',
  'a doorframe that closes on principle',
];
