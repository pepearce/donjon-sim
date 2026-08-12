import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '@donjon/shared';
import { newWorld } from '../src/engine/setup.js';
import {
  GAMBIT_COOLDOWN_DAYS,
  GAMBIT_DAYS,
  creditTollGambit,
  maybeDeclareGambit,
  tickGambit,
} from '../src/engine/systems/gambit.js';
import { bankLoot } from '../src/engine/systems/economy.js';
import { circulatingCoin } from '../src/engine/world.js';
import type { World } from '../src/engine/types.js';

const SEED = 0xd0f0a;

function desperateWorld(): World {
  const world = newWorld(SEED);
  world.tick = DAY_TICKS;
  world.dungeon.standing = 20;
  world.dungeon.treasuryCp = 8_000;
  world.dungeon.keeperTrait = 'gambler';
  return world;
}

function declareUntilSet(world: World): void {
  for (let day = 1; day <= 60 && !world.dungeon.gambit; day++) {
    world.tick = day * DAY_TICKS;
    maybeDeclareGambit(world);
  }
  expect(world.dungeon.gambit).not.toBeNull();
}

describe('gambit declaration', () => {
  it('eventually declares from a desperate position and escrows half the treasury', () => {
    const world = desperateWorld();
    const before = world.dungeon.treasuryCp;
    const sinkBefore = world.dungeon.sinkCp;
    declareUntilSet(world);

    const gambit = world.dungeon.gambit;
    expect(gambit?.stakeCp).toBe(Math.floor(before / 2));
    expect(world.dungeon.treasuryCp).toBe(before - gambit!.stakeCp);
    expect(world.dungeon.sinkCp).toBe(sinkBefore + gambit!.stakeCp);
    expect(gambit?.targetCp).toBeGreaterThanOrEqual(400);
    expect(gambit?.endsTick).toBe(world.tick + GAMBIT_DAYS * DAY_TICKS);
    expect(
      world.pendingEvents.some(
        (e) => e.type === 'KEEPER_GAMBIT' && e.payload['action'] === 'declared',
      ),
    ).toBe(true);
  });

  it('never declares in good standing, when rich, when broke, or on cooldown', () => {
    for (let day = 1; day <= 60; day++) {
      const tick = day * DAY_TICKS;

      const good = desperateWorld();
      good.tick = tick;
      good.dungeon.standing = 60;
      maybeDeclareGambit(good);
      expect(good.dungeon.gambit).toBeNull();

      const rich = desperateWorld();
      rich.tick = tick;
      rich.dungeon.treasuryCp = 50_000;
      maybeDeclareGambit(rich);
      expect(rich.dungeon.gambit).toBeNull();

      const broke = desperateWorld();
      broke.tick = tick;
      broke.dungeon.treasuryCp = 500;
      maybeDeclareGambit(broke);
      expect(broke.dungeon.gambit).toBeNull();

      const cooling = desperateWorld();
      cooling.tick = tick;
      cooling.dungeon.lastGambitEndedTick = tick - DAY_TICKS;
      maybeDeclareGambit(cooling);
      expect(cooling.dungeon.gambit).toBeNull();
    }
  });

  it('respects the cooldown length exactly', () => {
    const world = desperateWorld();
    world.dungeon.lastGambitEndedTick = 0;
    world.tick = GAMBIT_COOLDOWN_DAYS * DAY_TICKS - 1;
    maybeDeclareGambit(world);
    expect(world.dungeon.gambit).toBeNull();
  });
});

describe('gambit resolution', () => {
  it('pays double and lifts standing on a win', () => {
    const world = desperateWorld();
    declareUntilSet(world);
    const gambit = world.dungeon.gambit!;
    const treasury = world.dungeon.treasuryCp;
    const minted = world.dungeon.mintedCp;
    const standing = world.dungeon.standing;

    creditTollGambit(world, gambit.targetCp);
    world.tick = gambit.endsTick;
    tickGambit(world);

    expect(world.dungeon.gambit).toBeNull();
    expect(world.dungeon.treasuryCp).toBe(treasury + gambit.stakeCp * 2);
    expect(world.dungeon.mintedCp).toBe(minted + gambit.stakeCp * 2);
    expect(world.dungeon.standing).toBe(standing + 15);
    expect(world.dungeon.lastGambitEndedTick).toBe(world.tick);
    expect(
      world.pendingEvents.some((e) => e.type === 'KEEPER_GAMBIT' && e.payload['action'] === 'won'),
    ).toBe(true);
  });

  it('burns the stake and drops standing on a loss', () => {
    const world = desperateWorld();
    declareUntilSet(world);
    const gambit = world.dungeon.gambit!;
    const treasury = world.dungeon.treasuryCp;
    const standing = world.dungeon.standing;

    world.tick = gambit.endsTick;
    tickGambit(world);

    expect(world.dungeon.gambit).toBeNull();
    expect(world.dungeon.treasuryCp).toBe(treasury);
    expect(world.dungeon.standing).toBeLessThanOrEqual(standing - 10);
    expect(
      world.pendingEvents.some((e) => e.type === 'KEEPER_GAMBIT' && e.payload['action'] === 'lost'),
    ).toBe(true);
  });

  it('does not resolve before the window closes', () => {
    const world = desperateWorld();
    declareUntilSet(world);
    world.tick = world.dungeon.gambit!.endsTick - 1;
    tickGambit(world);
    expect(world.dungeon.gambit).not.toBeNull();
  });
});

describe('overseer skim', () => {
  it('skims a fifth of the toll into the sink under the overseer', () => {
    const world = newWorld(SEED);
    world.dungeon.standing = 5;
    const team = world.teams[0]!;
    team.carriedCp = 10_000;
    world.initialCoinCp = circulatingCoin(world);
    const treasury = world.dungeon.treasuryCp;

    bankLoot(world, team);

    const toll = world.pendingEvents.find((e) => e.type === 'TOLL_PAID');
    expect(toll).toBeDefined();
    const tollCp = Number(toll!.payload['tollCp']);
    const skimCp = Number(toll!.payload['skimCp']);
    expect(skimCp).toBe(Math.floor(tollCp * 0.2));
    expect(world.dungeon.treasuryCp).toBe(treasury + tollCp - skimCp);

    expect(circulatingCoin(world) + world.dungeon.sinkCp).toBe(
      world.initialCoinCp + world.dungeon.mintedCp,
    );
  });

  it('credits banked tolls toward an open gambit', () => {
    const world = desperateWorld();
    declareUntilSet(world);
    const team = world.teams[0]!;
    team.carriedCp = 10_000;

    bankLoot(world, team);

    const toll = world.pendingEvents.find((e) => e.type === 'TOLL_PAID');
    const tollCp = Number(toll!.payload['tollCp']);
    const skimCp = Number(toll!.payload['skimCp']);
    expect(world.dungeon.gambit!.collectedCp).toBe(tollCp - skimCp);
  });
});
