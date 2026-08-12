import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '@donjon/shared';
import { newWorld } from '../src/engine/setup.js';
import { FORECLOSE_DAYS, dailyUpkeep } from '../src/engine/systems/economy.js';
import { resolveLoan } from '../src/engine/systems/dungeon.js';
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
    expect(w.dungeon.standing).toBe(51);

    w.dungeon.treasuryCp = 1_000;
    updateStandingDaily(w, true);
    expect(w.dungeon.standing).toBe(49);

    w.dungeon.treasuryCp = 50_000;
    w.dungeon.austerity = true;
    updateStandingDaily(w, true);
    expect(w.dungeon.standing).toBe(47);
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
    insolvent(w, FORECLOSE_DAYS + 3);
    expect(w.foreclosed).toBe(false);
  });

  it('forecloses under the overseer after the insolvency streak', () => {
    const w = newWorld(SEED);
    w.dungeon.loanCp = 25_000;
    w.dungeon.standing = 0;
    w.dungeon.austerity = true;
    insolvent(w, FORECLOSE_DAYS);
    expect(w.foreclosed).toBe(true);
    expect(w.pendingEvents.some((e) => e.type === 'KHAN_FORECLOSURE')).toBe(true);
  });

  it('announces imminent foreclosure the day before', () => {
    const w = newWorld(SEED);
    w.dungeon.loanCp = 25_000;
    w.dungeon.standing = 0;
    insolvent(w, FORECLOSE_DAYS - 1);
    expect(w.foreclosed).toBe(false);
    expect(
      w.pendingEvents.some(
        (e) => e.type === 'KEEPER_DECREE' && e.payload['decree'] === 'foreclosure_imminent',
      ),
    ).toBe(true);
  });
});
