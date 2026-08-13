import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '@donjon/shared';
import { newWorld } from '../src/engine/setup.js';
import { ECON, dailyUpkeep } from '../src/engine/systems/economy.js';
import { austerityLiftCp, resolveLoan } from '../src/engine/systems/dungeon.js';
import { hiringBudgetCp } from '../src/engine/systems/restock.js';
import { adjustKhanStanding, rungOf, updateStandingDaily } from '../src/engine/systems/standing.js';
import type { World } from '../src/engine/types.js';

const SEED = 0xd0f0a;

function world(): World {
  const w = newWorld(SEED);
  w.tick = DAY_TICKS;
  return w;
}

describe('rungOf', () => {
  it('maps standing to rungs at the spec thresholds', () => {
    expect(rungOf(100)).toBe('favored');
    expect(rungOf(75)).toBe('favored');
    expect(rungOf(74)).toBe('good');
    expect(rungOf(40)).toBe('good');
    expect(rungOf(39)).toBe('censured');
    expect(rungOf(15)).toBe('censured');
    expect(rungOf(14)).toBe('overseer');
    expect(rungOf(0)).toBe('overseer');
  });
});

describe('adjustKhanStanding', () => {
  it('clamps standing to 0..100', () => {
    const w = world();
    w.dungeon.standing = 95;
    adjustKhanStanding(w, 20);
    expect(w.dungeon.standing).toBe(100);
    w.dungeon.standing = 3;
    adjustKhanStanding(w, -20);
    expect(w.dungeon.standing).toBe(0);
  });

  it('emits a rung change event on a downward crossing', () => {
    const w = world();
    w.dungeon.standing = 41;
    adjustKhanStanding(w, -2);
    const change = w.pendingEvents.find((e) => e.type === 'KEEPER_RUNG_CHANGED');
    expect(change).toBeDefined();
    expect(change?.payload['from']).toBe('good');
    expect(change?.payload['to']).toBe('censured');
    expect(String(change?.payload['text']).length).toBeGreaterThan(0);
  });

  it('installs a named overseer at the bottom rung and dismisses on recovery', () => {
    const w = world();
    w.dungeon.standing = 16;
    adjustKhanStanding(w, -2);
    expect(rungOf(w.dungeon.standing)).toBe('overseer');
    expect(w.dungeon.overseerName.length).toBeGreaterThan(0);
    const installed = w.pendingEvents.find(
      (e) => e.type === 'KHAN_OVERSEER' && e.payload['action'] === 'installed',
    );
    expect(installed).toBeDefined();

    adjustKhanStanding(w, 10);
    expect(w.dungeon.overseerName).toBe('');
    const dismissed = w.pendingEvents.find(
      (e) => e.type === 'KHAN_OVERSEER' && e.payload['action'] === 'dismissed',
    );
    expect(dismissed).toBeDefined();
  });

  it('costs a vain keeper one extra point on a rung down', () => {
    const w = world();
    w.dungeon.keeperTrait = 'vain';
    w.dungeon.standing = 41;
    adjustKhanStanding(w, -2);
    expect(w.dungeon.standing).toBe(38);

    w.dungeon.keeperTrait = 'miserly';
    w.dungeon.standing = 41;
    adjustKhanStanding(w, -2);
    expect(w.dungeon.standing).toBe(39);
  });
});

describe('updateStandingDaily', () => {
  it('accrues on a solvent fully-paid day and bleeds when insolvent or austere', () => {
    const w = world();
    w.dungeon.standing = 50;
    w.dungeon.treasuryCp = 50_000;
    updateStandingDaily(w, true);
    expect(w.dungeon.standing).toBe(52);

    w.dungeon.loanCp = 10_000;
    updateStandingDaily(w, true);
    expect(w.dungeon.standing).toBe(53);

    w.dungeon.treasuryCp = 1_000;
    updateStandingDaily(w, true);
    expect(w.dungeon.standing).toBe(51);

    w.dungeon.treasuryCp = 50_000;
    w.dungeon.austerity = true;
    updateStandingDaily(w, true);
    expect(w.dungeon.standing).toBe(49);
  });
});

describe('loan standing', () => {
  it('docks standing when the loan is taken and rewards full repayment', () => {
    const w = world();
    w.dungeon.standing = 50;
    w.dungeon.treasuryCp = 1_000;
    resolveLoan(w);
    expect(w.dungeon.loanCp).toBeGreaterThan(0);
    expect(w.dungeon.standing).toBe(45);
    expect(w.dungeon.loanTakenTick).toBe(w.tick);

    w.dungeon.treasuryCp = 200_000;
    while (w.dungeon.loanCp > 0) resolveLoan(w);
    expect(w.dungeon.standing).toBe(55);
  });

  it('spares a favored keeper the austerity demand on loan day', () => {
    const w = world();
    w.dungeon.standing = 80;
    w.dungeon.treasuryCp = 1_000;
    resolveLoan(w);
    w.dungeon.treasuryCp = 1_000;
    resolveLoan(w);
    expect(w.dungeon.austerity).toBe(false);

    w.tick += DAY_TICKS;
    resolveLoan(w);
    expect(w.dungeon.austerity).toBe(true);
  });
});

describe('foreclosure gate', () => {
  function insolvent(w: World, days: number): void {
    for (let day = 1; day <= days; day++) {
      w.tick = day * DAY_TICKS;
      w.dungeon.treasuryCp = 0;
      dailyUpkeep(w);
    }
  }

  it('never forecloses above the overseer rung', () => {
    const w = newWorld(SEED);
    w.dungeon.loanCp = 25_000;
    w.dungeon.standing = 50;
    insolvent(w, ECON.forecloseDays + 3);
    expect(w.foreclosed).toBe(false);
  });

  it('forecloses under the overseer after the insolvency streak', () => {
    const w = newWorld(SEED);
    w.dungeon.loanCp = 25_000;
    w.dungeon.standing = 0;
    w.dungeon.austerity = true;
    insolvent(w, ECON.forecloseDays);
    expect(w.foreclosed).toBe(true);
    expect(w.pendingEvents.some((e) => e.type === 'KHAN_FORECLOSURE')).toBe(true);
  });

  it('announces imminent foreclosure the day before', () => {
    const w = newWorld(SEED);
    w.dungeon.loanCp = 25_000;
    w.dungeon.standing = 0;
    insolvent(w, ECON.forecloseDays - 1);
    expect(w.foreclosed).toBe(false);
    expect(
      w.pendingEvents.some(
        (e) => e.type === 'KEEPER_DECREE' && e.payload['decree'] === 'foreclosure_imminent',
      ),
    ).toBe(true);
  });
});

describe('recovery', () => {
  it('repays the loan in installments from the surplus above the floor', () => {
    const w = world();
    w.dungeon.loanCp = 12_000;
    w.dungeon.treasuryCp = 11_000;
    resolveLoan(w);
    expect(w.dungeon.treasuryCp).toBe(11_000 - 750);
    expect(w.dungeon.loanCp).toBe(12_000 - 750);
  });

  it('never repays the treasury below the floor', () => {
    const w = world();
    w.dungeon.loanCp = 25_000;
    w.dungeon.treasuryCp = 8_000;
    resolveLoan(w);
    expect(w.dungeon.treasuryCp).toBe(8_000);
    expect(w.dungeon.loanCp).toBe(25_000);
  });

  it('lifts austerity once the treasury can carry the wage bill', () => {
    const w = world();
    w.dungeon.austerity = true;
    w.dungeon.loanCp = 12_000;
    w.dungeon.treasuryCp = Math.max(austerityLiftCp(w), 9_000);
    resolveLoan(w);
    expect(w.dungeon.austerity).toBe(false);
    expect(
      w.pendingEvents.some(
        (e) => e.type === 'KEEPER_DECREE' && e.payload['decree'] === 'wages_resume',
      ),
    ).toBe(true);
    expect(w.dungeon.loanCp).toBeLessThan(12_000);
  });

  it('re-enters austerity only below the distress line', () => {
    const w = world();
    w.dungeon.loanCp = 12_000;
    w.dungeon.treasuryCp = 7_000;
    resolveLoan(w);
    expect(w.dungeon.austerity).toBe(false);

    w.dungeon.treasuryCp = 4_000;
    resolveLoan(w);
    expect(w.dungeon.austerity).toBe(true);
  });
});

describe('hiring budget', () => {
  it('freezes hiring to the austerity floor while wages go unpaid', () => {
    const w = world();
    w.dungeon.austerity = true;
    w.dungeon.treasuryCp = 500_000;
    expect(hiringBudgetCp(w)).toBe(5_000);
  });

  it('scales the payroll budget with the treasury when solvent', () => {
    const w = world();
    w.dungeon.treasuryCp = 100_000;
    expect(hiringBudgetCp(w)).toBe(20_000);
    w.dungeon.treasuryCp = 1_000;
    expect(hiringBudgetCp(w)).toBe(5_000);
  });
});
