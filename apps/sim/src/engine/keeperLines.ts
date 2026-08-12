import { RngDomain, rngFor } from '@donjon/shared';
import type { World } from './types.js';

export const KEEPER_OCCASIONS = [
  'rung_up',
  'rung_down',
  'overseer_installed',
  'overseer_dismissed',
  'gambit_declared',
  'gambit_won',
  'gambit_lost',
  'loan_taken',
  'loan_repaid',
  'foreclosure_imminent',
] as const;

export type KeeperOccasion = (typeof KEEPER_OCCASIONS)[number];

type Pool = Record<string, string[]>;

const LINES: Record<KeeperOccasion, Pool> = {
  rung_up: {
    miserly: [
      'the Khan smiles, which costs nothing, which is why the Keeper likes it',
      'favor regained at no extra charge — the best kind of favor',
    ],
    vain: [
      'the Keeper has his portrait rehung in the Khan’s antechamber',
      'word of the Keeper’s excellence reaches the Khan, as arranged',
    ],
    vengeful: [
      'the Khan’s favor returns; the list of who doubted is retained',
      'standing restored — certain names remain underlined in the ledger',
    ],
    gambler: [
      'the Khan’s favor won back, double or nothing next time',
      'the table turns and the Keeper rakes in a little respectability',
    ],
  },
  rung_down: {
    miserly: [
      'the Khan’s regard dips; the Keeper prices it at a copper',
      'standing lost — an expense the Keeper had not budgeted',
    ],
    vain: [
      'a cold letter from the Khan; the Keeper reads it twice and burns it',
      'the Keeper’s name moves down a list he pretends not to keep',
    ],
    vengeful: [
      'demoted in the Khan’s esteem — someone will answer for this',
      'the Khan frowns southward; the Keeper starts a new page of grudges',
    ],
    gambler: [
      'a bad hand with the Khan; the Keeper doubles down anyway',
      'the odds on the Keeper lengthen and he pretends to like it',
    ],
  },
  overseer_installed: {
    miserly: [
      'an overseer arrives, salaried, which offends the Keeper most of all',
      'the Khan installs an overseer and bills the dungeon for the desk',
    ],
    vain: [
      'an overseer now sits at the Keeper’s own desk, in the Keeper’s own chair',
      'the indignity of supervision descends upon the Keeper',
    ],
    vengeful: [
      'the overseer takes the master key; the Keeper memorises their face',
      'an overseer presides — the Keeper files this under debts unpaid',
    ],
    gambler: [
      'the house has a new pit boss and the Keeper hates the house',
      'an overseer arrives to watch the Keeper’s hands at all times',
    ],
  },
  overseer_dismissed: {
    miserly: [
      'the overseer departs and takes their salary with them — good riddance',
      'supervision ends; the Keeper counts the silverware anyway',
    ],
    vain: [
      'the overseer is dismissed; the Keeper reclaims the good chair',
      'the Keeper resumes his rightful place, and says so at length',
    ],
    vengeful: [
      'the overseer departs unthanked; their name stays in the book',
      'the master key returns to the Keeper’s belt, warm with grudge',
    ],
    gambler: [
      'the pit boss cashes out; the Keeper deals again',
      'the overseer leaves and the Keeper pockets the dice',
    ],
  },
  gambit_declared: {
    miserly: [
      'half the vault staked — the Keeper watches every coin of it go',
      'the Keeper wagers his hoard with the face of a man donating blood',
    ],
    vain: [
      'the Keeper stakes his treasury to prove a point about himself',
      'a grand wager, announced grandly, from a nearly empty vault',
    ],
    vengeful: [
      'the Keeper stakes the vault — someone drove him to this',
      'a wager laid in spite; the Khan holds the purse',
    ],
    gambler: [
      'at last, a proper bet — half the vault on the table',
      'the Keeper pushes his stack in and grins at the Khan',
    ],
  },
  gambit_won: {
    miserly: [
      'the wager pays double and the Keeper counts it three times',
      'coin returns with interest, the only houseguest the Keeper loves',
    ],
    vain: [
      'the gambit lands and the Keeper commissions a small triumphal plaque',
      'won, of course — the Keeper never doubted himself aloud',
    ],
    vengeful: [
      'the gambit pays out; the Keeper smiles at his list of doubters',
      'double the stake, and vindication besides',
    ],
    gambler: [
      'the dice come home — the vault rings with the Keeper’s winnings',
      'the Keeper rakes the pot and asks the Khan to go again',
    ],
  },
  gambit_lost: {
    miserly: [
      'the stake is gone; the Keeper closes the vault door on nothing',
      'the Khan keeps the wager and the Keeper keeps the grief',
    ],
    vain: [
      'the gambit fails; the Keeper forbids all mention of it',
      'lost — the plaque is quietly cancelled',
    ],
    vengeful: [
      'the stake forfeits to the Khan; a new page of the grudge-book opens',
      'lost, and the Keeper knows exactly whom to blame',
    ],
    gambler: [
      'the dice betray the Keeper, who blames the dice',
      'the pot goes north to the Khan; the Keeper mutters about a rematch',
    ],
  },
  loan_taken: {
    miserly: [
      'the Keeper signs the Khan’s note and grieves each future interest payment',
      'borrowed coin — heavier than the honest kind',
    ],
    vain: [
      'a discreet loan, taken through intermediaries, discussed by no one',
      'the Keeper accepts the Khan’s coin and calls it patronage',
    ],
    vengeful: [
      'the Khan’s loan lands like a debt of honour, which it is not',
      'coin from the north, terms attached, resentment accruing daily',
    ],
    gambler: [
      'fresh stake money from the Khan — the game continues',
      'the Keeper borrows big and calls it table money',
    ],
  },
  loan_repaid: {
    miserly: [
      'the Khan’s note burns merrily in the grate; the Keeper warms his hands',
      'debt cleared, interest ended, joy briefly permitted',
    ],
    vain: [
      'repaid in full and mentioned in every conversation thereafter',
      'the Keeper settles with the Khan, loudly',
    ],
    vengeful: [
      'the debt is paid; the ledger closes on that indignity',
      'settled — the Khan holds nothing over the Keeper now',
    ],
    gambler: [
      'the marker is bought back; the Keeper plays on with house money',
      'debts cleared, dice warm, vault breathing again',
    ],
  },
  foreclosure_imminent: {
    miserly: [
      'one more insolvent dawn and the Khan takes everything, itemised',
      'the Keeper counts what remains; it does not take long',
    ],
    vain: [
      'the bailiffs are said to be beyond the ridge; the Keeper dresses well regardless',
      'ruin nears; the Keeper practices looking unbothered',
    ],
    vengeful: [
      'the Khan’s bailiffs near; the Keeper writes names by candlelight',
      'one day from seizure, and still the grudge-book gets its entry',
    ],
    gambler: [
      'last hand — the dungeon itself is on the table now',
      'one dawn left; the Keeper checks the dice one more time',
    ],
  },
};

export function keeperLine(world: World, occasion: KeeperOccasion): string {
  const pool = LINES[occasion];
  const lines = pool[world.dungeon.keeperTrait] ?? pool['miserly'] ?? [];
  if (lines.length === 0) return '';
  const rng = rngFor(world.seed, world.tick, RngDomain.KEEPER_VOICE, KEEPER_OCCASIONS.indexOf(occasion));
  return rng.pick(lines);
}
