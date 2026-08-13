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

export interface TraitRow {
  id: string;
  label: string;
  blurb: string;
}

export const TRAITS: TraitRow[] = [
  { id: 'greedy', label: 'Greedy', blurb: 'Reads the ledger before the last rites.' },
  { id: 'craven', label: 'Craven', blurb: 'First to the stairs, every time, on principle.' },
  { id: 'bold', label: 'Bold', blurb: 'Signs the waiver without turning the page.' },
  { id: 'vengeful', label: 'Vengeful', blurb: 'Keeps a grudge in triplicate.' },
  { id: 'loyal', label: 'Loyal', blurb: 'Will drag a colleague home unpaid.' },
  { id: 'reckless', label: 'Reckless', blurb: 'Considers hazard pay a personal challenge.' },
  { id: 'cautious', label: 'Cautious', blurb: 'Has never once opened a door first.' },
  { id: 'pious', label: 'Pious', blurb: 'Tithes to something that has not confirmed receipt.' },
  { id: 'lucky', label: 'Lucky', blurb: 'Survives on a technicality most weeks.' },
  { id: 'glory_hound', label: 'Glory Hound', blurb: 'Wants the plaque more than the payout.' },
  { id: 'hoarder', label: 'Hoarder', blurb: 'Banks nothing, carries everything, dies rich.' },
  { id: 'superstitious', label: 'Superstitious', blurb: 'Will not delve on an odd tick.' },
];

export interface EpithetRow {
  id: string;
  text: string;
  requires: string;
}

export const EPITHETS: EpithetRow[] = [
  { id: 'kills10_a', text: 'the Unaudited', requires: 'kills10' },
  { id: 'kills10_b', text: 'Ledgerbane', requires: 'kills10' },
  { id: 'kills10_c', text: 'the Ten-Times Deducted', requires: 'kills10' },
  { id: 'kills10_d', text: 'Writ-of-Slaughter', requires: 'kills10' },
  { id: 'level5_a', text: 'the Tenured', requires: 'level5' },
  { id: 'level5_b', text: 'the Fifth-Grade Delver', requires: 'level5' },
  { id: 'level5_c', text: 'the Vested', requires: 'level5' },
  { id: 'level5_d', text: 'the Promoted', requires: 'level5' },
  { id: 'lonesurvivor_a', text: 'the Sole Claimant', requires: 'lonesurvivor' },
  { id: 'lonesurvivor_b', text: 'the Last Line Item', requires: 'lonesurvivor' },
  { id: 'lonesurvivor_c', text: 'Widow of the Roster', requires: 'lonesurvivor' },
  { id: 'lonesurvivor_d', text: 'the Surviving Party', requires: 'lonesurvivor' },
  { id: 'nemesis_a', text: 'the Settled Account', requires: 'nemesis' },
  { id: 'nemesis_b', text: 'Grudgekeeper', requires: 'nemesis' },
  { id: 'nemesis_c', text: 'the Reconciled', requires: 'nemesis' },
  { id: 'nemesis_d', text: 'Debt-Collected', requires: 'nemesis' },
  { id: 'deep_a', text: 'the Sublevelled', requires: 'deep' },
  { id: 'deep_b', text: 'Fourth-Floor Fixture', requires: 'deep' },
  { id: 'deep_c', text: 'the Deeply Filed', requires: 'deep' },
  { id: 'deep_d', text: 'of the Lower Vault', requires: 'deep' },
  { id: 'rich_a', text: 'the Liquid', requires: 'rich' },
  { id: 'rich_b', text: 'Purse-of-Office', requires: 'rich' },
  { id: 'rich_c', text: 'the Solvent', requires: 'rich' },
  { id: 'rich_d', text: 'Coinsworn', requires: 'rich' },
];

export const SCHEME_NAMES = [
  'Operation Quarterly Bloodletting',
  'The Adverse Findings Initiative',
  'Programme Deepwater Writeoff',
  'The Reconciliation of Losses',
  'Operation Courteous Foreclosure',
  'The Structured Discouragement',
  'Programme Tollgate Surplus',
  'The Involuntary Retirement Scheme',
  'Operation Prudent Attrition',
  'The Final Notice Campaign',
];

export interface GuardianNameRow {
  name: string;
  title: string;
}

export const GUARDIAN_NAMES: GuardianNameRow[] = [
  { name: 'Vaultmaw', title: 'Auditor of the Lower Vault' },
  { name: 'Grimlend', title: 'Holder of Bad Debt' },
  { name: 'Ossifer Bray', title: 'Bailiff of the Third Landing' },
  { name: 'Tallowsend', title: 'Keeper of the Petty Cash' },
  { name: 'Marrowclerk', title: 'Registrar of the Fallen' },
  { name: 'Quillspite', title: 'Notary of Unread Clauses' },
  { name: 'Ironsum', title: 'Reconciler of Accounts' },
  { name: 'The Grey Assessor', title: 'Valuer of Estates in Arrears' },
  { name: 'Cinderwrit', title: 'Warden of the Burnt Ledgers' },
  { name: 'Dampsworn', title: 'Steward of the Flooded Wing' },
  { name: 'Gallowsfee', title: 'Collector of the Corpse Tax' },
  { name: 'Lastcandle', title: 'Overseer of Closing Hours' },
];

export interface KeeperActionDef {
  id: string;
  text: string;
  costCp: number;
  reserveCp: number;
  cooldownDays: number;
  weights: Record<string, number>;
  tollBp?: number;
  entryFeeCp?: number;
  corpseTaxBp?: number;
}

export const KEEPER_ACTIONS: KeeperActionDef[] = [
  {
    id: 'toll_up',
    text: 'tolls doubled until further notice',
    costCp: 0,
    reserveCp: 0,
    cooldownDays: 2,
    weights: { bankrupt: 3, panicked: 0, greedy: 4, content: 1 },
    tollBp: 3000,
  },
  {
    id: 'toll_cut',
    text: 'tolls eased, for the look of the thing',
    costCp: 0,
    reserveCp: 0,
    cooldownDays: 2,
    weights: { bankrupt: 0, panicked: 0, greedy: 0, content: 1 },
    tollBp: 1000,
  },
  {
    id: 'entry_waive',
    text: 'entry fee waived for the brave',
    costCp: 0,
    reserveCp: 0,
    cooldownDays: 3,
    weights: { bankrupt: 0, panicked: 1, greedy: 0, content: 0 },
    entryFeeCp: 0,
  },
  {
    id: 'marketing',
    text: 'a recruitment drive in the villages',
    costCp: 2000,
    reserveCp: 0,
    cooldownDays: 2,
    weights: { bankrupt: 0, panicked: 3, greedy: 0, content: 2 },
    entryFeeCp: 100,
  },
  {
    id: 'fee_restore',
    text: 'the door price returns to its proper figure',
    costCp: 0,
    reserveCp: 0,
    cooldownDays: 3,
    weights: { bankrupt: 3, panicked: 0, greedy: 2, content: 1 },
    entryFeeCp: 500,
  },
  {
    id: 'corpse_tax_up',
    text: 'corpse tax raised, effective immediately',
    costCp: 0,
    reserveCp: 0,
    cooldownDays: 3,
    weights: { bankrupt: 3, panicked: 0, greedy: 3, content: 0 },
    corpseTaxBp: 9500,
  },
  {
    id: 'corpse_tax_cut',
    text: 'a widow’s share restored to the fallen',
    costCp: 0,
    reserveCp: 0,
    cooldownDays: 3,
    weights: { bankrupt: 0, panicked: 1, greedy: 0, content: 1 },
    corpseTaxBp: 6000,
  },
  {
    id: 'hire_guardian',
    text: 'a guardian engaged on the usual terms',
    costCp: 0,
    reserveCp: 40_000,
    cooldownDays: 1,
    weights: { bankrupt: 0, panicked: 1, greedy: 3, content: 3 },
  },
  {
    id: 'open_scheme',
    text: 'a private agenda opened against the leaders',
    costCp: 1500,
    reserveCp: 0,
    cooldownDays: 1,
    weights: { bankrupt: 1, panicked: 2, greedy: 3, content: 2 },
  },
  {
    id: 'austerity',
    text: 'all guardians to work unpaid this quarter',
    costCp: 0,
    reserveCp: 0,
    cooldownDays: 3,
    weights: { bankrupt: 5, panicked: 1, greedy: 0, content: 0 },
  },
  {
    id: 'observe',
    text: 'watched the ledger and did nothing',
    costCp: 0,
    reserveCp: 0,
    cooldownDays: 0,
    weights: { bankrupt: 1, panicked: 1, greedy: 1, content: 1 },
  },
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
