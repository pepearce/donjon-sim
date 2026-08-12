import { RngDomain, rngFor } from '@donjon/shared';

export const KEEPER_TRAITS = ['miserly', 'vain', 'vengeful', 'gambler'] as const;
export type KeeperTrait = (typeof KEEPER_TRAITS)[number];

const NAME_FRONTS = [
  'Mor', 'Grav', 'Osk', 'Vel', 'Har', 'Bal', 'Quil', 'Dreg', 'Fen', 'Skarn', 'Thrym', 'Cald',
];

const NAME_BACKS = [
  'glut', 'moril', 'wick', 'grim', 'stone', 'mand', 'row', 'basck', 'fell', 'urn', 'lock', 'geld',
];

const NAME_TITLES = [
  'the Undertaker',
  'the Under-Auditor',
  'of the Ninth Ledger',
  'the Debt-Warden',
  'Coinwright',
  'the Unforeclosed',
  'Master of Arrears',
  'the Tollkeeper',
  'of the Sunken Vault',
  'the Grasping',
  'Clerk of Dooms',
  'the Twice-Bankrupt',
];

export interface KeeperPersona {
  name: string;
  trait: KeeperTrait;
}

export function rollKeeperPersona(seed: number): KeeperPersona {
  const rng = rngFor(seed, 0, RngDomain.KEEPER_PERSONA, 0);
  const name = `${rng.pick(NAME_FRONTS)}${rng.pick(NAME_BACKS)} ${rng.pick(NAME_TITLES)}`;
  return { name, trait: rng.pick(KEEPER_TRAITS) };
}
