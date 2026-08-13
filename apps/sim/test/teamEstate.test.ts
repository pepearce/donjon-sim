import { describe, expect, it } from 'vitest';
import { newWorld } from '../src/engine/setup.js';
import { formTeams, retireStragglers } from '../src/engine/systems/recruit.js';
import { keeperEligible } from '../src/engine/systems/keeper.js';
import { circulatingCoin, heroById, roster } from '../src/engine/world.js';
import type { Team, World } from '../src/engine/types.js';

const SEED = 0xd0f0a;

function identity(world: World): number {
  return circulatingCoin(world) + world.dungeon.sinkCp - world.dungeon.mintedCp;
}

function disband(world: World, team: Team): void {
  team.state = 'disbanded';
  team.disbandedTick = world.tick;
}

describe('disband estate', () => {
  it('splits the bank and carried coin among survivors, remainder to the first', () => {
    const world = newWorld(SEED);
    const team = world.teams[0]!;
    const crew = roster(world, team);
    expect(crew.length).toBe(3);
    team.goldCp = 1_000;
    team.carriedCp = 3;
    const purses = crew.map((h) => h.goldCp);
    const before = identity(world);

    disband(world, team);
    retireStragglers(world);

    expect(team.goldCp).toBe(0);
    expect(team.carriedCp).toBe(0);
    expect(crew[0]!.goldCp).toBe(purses[0]! + 334 + 1);
    expect(crew[1]!.goldCp).toBe(purses[1]! + 334);
    expect(crew[2]!.goldCp).toBe(purses[2]! + 334);
    expect(identity(world)).toBe(before);
  });

  it('escheats the bank to the keeper when nobody survives', () => {
    const world = newWorld(SEED);
    const team = world.teams[0]!;
    for (const hero of roster(world, team)) {
      hero.state = 'dead';
      hero.diedTick = world.tick;
    }
    team.goldCp = 2_500;
    const treasury = world.dungeon.treasuryCp;
    const before = identity(world);

    disband(world, team);
    retireStragglers(world);

    expect(team.goldCp).toBe(0);
    expect(world.dungeon.treasuryCp).toBe(treasury + 2_500);
    expect(world.pendingEvents.some((e) => e.type === 'TEAM_ESTATE_SEIZED')).toBe(true);
    expect(identity(world)).toBe(before);
  });

  it('books a tavern-overflow retiree purse to the sink', () => {
    const world = newWorld(SEED);
    while (world.tavern.length < 20) world.tavern.push(world.tavern[0]!);
    const team = world.teams[0]!;
    const crew = roster(world, team);
    team.goldCp = 0;
    for (const hero of crew) hero.goldCp = 700;
    const sink = world.dungeon.sinkCp;
    const before = identity(world);

    disband(world, team);
    retireStragglers(world);

    for (const hero of crew) expect(hero.goldCp).toBe(0);
    expect(world.dungeon.sinkCp).toBe(sink + 700 * crew.length);
    const retired = world.pendingEvents.filter((e) => e.type === 'HERO_RETIRED');
    expect(retired.length).toBe(crew.length);
    expect(retired[0]?.payload['goldCp']).toBe(700);
    expect(identity(world)).toBe(before);
  });
});

describe('purse-funded team formation', () => {
  function forceForm(world: World): Team | undefined {
    const teams = world.teams.length;
    for (let i = 0; i < 5_000 && world.teams.length === teams; i++) {
      world.tick += 1;
      formTeams(world);
    }
    return world.teams[teams];
  }

  it('founds a rich team from rich tavern purses without minting', () => {
    const world = newWorld(SEED);
    for (const id of world.tavern) heroById(world, id)!.goldCp = 2_000;
    const minted = world.dungeon.mintedCp;
    const before = identity(world);

    const team = forceForm(world);
    expect(team).toBeDefined();

    const members = roster(world, team!);
    expect(team!.goldCp).toBe(1_000 * members.length);
    for (const hero of members) expect(hero.goldCp).toBe(1_000);
    expect(world.dungeon.mintedCp).toBe(minted);
    expect(identity(world)).toBe(before);
  });

  it('mints a top-up to the founding floor for broke founders', () => {
    const world = newWorld(SEED);
    for (const id of world.tavern) heroById(world, id)!.goldCp = 0;
    const minted = world.dungeon.mintedCp;

    const team = forceForm(world);
    expect(team).toBeDefined();
    expect(team!.goldCp).toBe(1_200);
    expect(world.dungeon.mintedCp).toBe(minted + 1_200);
  });
});

describe('fee_restore action', () => {
  it('offers the restore only while the fee is down', () => {
    const world = newWorld(SEED);
    world.tick = 600;
    world.dungeon.keeperMood = 'bankrupt';
    world.dungeon.treasuryCp = 1_000;
    world.dungeon.entryFeeCp = 0;
    expect(keeperEligible(world).map((a) => a.id)).toContain('fee_restore');

    world.dungeon.entryFeeCp = 500;
    expect(keeperEligible(world).map((a) => a.id)).not.toContain('fee_restore');
  });
});
