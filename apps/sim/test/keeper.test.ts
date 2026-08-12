import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '@donjon/shared';
import { newWorld } from '../src/engine/setup.js';
import { KEEPER_ACTIONS } from '../src/engine/tables.js';
import { keeperAct, keeperCost, keeperEligible, traitWeightMult } from '../src/engine/systems/keeper.js';
import { maybeStartScheme } from '../src/engine/systems/dungeon.js';
import { killHero, sweepCorpse } from '../src/engine/systems/death.js';
import { circulatingCoin, livingRoster } from '../src/engine/world.js';
import type { World } from '../src/engine/types.js';

const SEED = 0xd0f0a;

function worldAt(mood: string, treasuryCp: number): World {
  const world = newWorld(SEED);
  world.tick = DAY_TICKS;
  world.dungeon.keeperMood = mood;
  world.dungeon.treasuryCp = treasuryCp;
  return world;
}

function ids(world: World): string[] {
  return keeperEligible(world).map((a) => a.id);
}

describe('keeper action menu', () => {
  it('gives every action a weight for every mood the sim can produce', () => {
    for (const action of KEEPER_ACTIONS) {
      for (const mood of ['bankrupt', 'panicked', 'greedy', 'content']) {
        expect(typeof action.weights[mood]).toBe('number');
      }
    }
  });

  it('never lets a bankrupt Keeper hire a guardian', () => {
    expect(ids(worldAt('bankrupt', 500_000))).not.toContain('hire_guardian');
  });

  it('lets a content Keeper with a full treasury hire', () => {
    expect(ids(worldAt('content', 500_000))).toContain('hire_guardian');
  });

  it('drops priced actions the treasury cannot cover', () => {
    const world = worldAt('greedy', 0);
    for (const action of keeperEligible(world)) {
      expect(keeperCost(world, action)).toBe(0);
    }
    expect(ids(world)).toContain('observe');
  });

  it('holds a reserve back so hiring cannot empty the treasury', () => {
    const world = worldAt('content', 0);
    const hire = KEEPER_ACTIONS.find((a) => a.id === 'hire_guardian');
    expect(hire).toBeDefined();
    world.dungeon.treasuryCp = keeperCost(world, hire!) + hire!.reserveCp - 1;
    expect(ids(world)).not.toContain('hire_guardian');
    world.dungeon.treasuryCp = keeperCost(world, hire!) + hire!.reserveCp;
    expect(ids(world)).toContain('hire_guardian');
  });

  it('keeps austerity off the menu while the Keeper is solvent', () => {
    expect(ids(worldAt('bankrupt', 500_000))).not.toContain('austerity');
    expect(ids(worldAt('bankrupt', 1_000))).toContain('austerity');
  });
});

describe('keeperAct', () => {
  it('records the action it took and puts it on cooldown', () => {
    const world = worldAt('greedy', 200_000);
    const taken = keeperAct(world);

    expect(world.dungeon.keeperAct.last).toBe(taken);
    expect(world.dungeon.keeperAct.tick).toBe(world.tick);
    expect(world.dungeon.keeperAct.text.length).toBeGreaterThan(0);
    expect(world.dungeon.keeperAct.cooldowns[taken]).toBe(world.tick);
  });

  it('excludes an action until its cooldown expires', () => {
    const world = worldAt('greedy', 200_000);
    const taken = keeperAct(world);
    const def = KEEPER_ACTIONS.find((a) => a.id === taken);
    expect(def).toBeDefined();
    if (def!.cooldownDays === 0) return;

    expect(ids(world)).not.toContain(taken);

    world.tick += def!.cooldownDays * DAY_TICKS;
    expect(ids(world)).toContain(taken);
  });

  it('moves the cost from the treasury into the sink', () => {
    const world = worldAt('content', 500_000);
    const treasuryBefore = world.dungeon.treasuryCp;
    const sinkBefore = world.dungeon.sinkCp;

    const taken = keeperAct(world);
    const spent = treasuryBefore - world.dungeon.treasuryCp;

    expect(spent).toBeGreaterThanOrEqual(0);
    expect(world.dungeon.sinkCp - sinkBefore).toBe(spent);
    if (spent > 0) expect(taken).not.toBe('observe');
  });

  it('falls back to observe when nothing else is affordable', () => {
    const world = worldAt('content', 0);
    for (const action of KEEPER_ACTIONS) {
      if (action.id !== 'observe') world.dungeon.keeperAct.cooldowns[action.id] = world.tick;
    }
    expect(keeperAct(world)).toBe('observe');
    expect(world.dungeon.treasuryCp).toBe(0);
  });

  it('is deterministic across ten days for the same seed and divergent for another', () => {
    const sequence = (seed: number): string[] => {
      const world = newWorld(seed);
      world.dungeon.treasuryCp = 300_000;
      const out: string[] = [];
      for (let day = 1; day <= 10; day++) {
        world.tick = day * DAY_TICKS;
        out.push(keeperAct(world));
      }
      return out;
    };

    expect(sequence(SEED)).toEqual(sequence(SEED));
    expect(sequence(SEED)).not.toEqual(sequence(SEED + 977));
  });

  it('hires a guardian that costs coin and draws a wage', () => {
    const world = worldAt('content', 500_000);
    const monstersBefore = world.monsters.length;
    const treasuryBefore = world.dungeon.treasuryCp;

    world.dungeon.keeperAct.cooldowns = Object.fromEntries(
      KEEPER_ACTIONS.filter((a) => a.id !== 'hire_guardian').map((a) => [a.id, world.tick]),
    );
    const taken = keeperAct(world);

    expect(taken).toBe('hire_guardian');
    expect(world.monsters.length).toBe(monstersBefore + 1);
    const hired = world.monsters[world.monsters.length - 1];
    expect(hired?.guardian).toBe(true);
    expect(hired?.wageCpPerDay).toBeGreaterThan(0);
    expect(world.dungeon.treasuryCp).toBeLessThan(treasuryBefore);
  });
});

function estateWorld(): { world: World; heroId: number; teamId: number } {
  const world = newWorld(SEED);
  const team = world.teams[0];
  if (!team) throw new Error('no team');
  const hero = livingRoster(world, team)[0];
  if (!hero) throw new Error('no hero');
  return { world, heroId: hero.id, teamId: team.id };
}

function heroOf(world: World, id: number) {
  const hero = world.heroes.find((h) => h.id === id);
  if (!hero) throw new Error('hero gone');
  return hero;
}

function teamOf(world: World, id: number) {
  const team = world.teams.find((t) => t.id === id);
  if (!team) throw new Error('team gone');
  return team;
}

describe('corpse tax', () => {
  it('splits the estate by the current rate', () => {
    const takeAt = (bp: number): { tax: number; widow: number } => {
      const { world, heroId, teamId } = estateWorld();
      world.dungeon.corpseTaxBp = bp;
      heroOf(world, heroId).goldCp = 1_000;
      teamOf(world, teamId).carriedCp = 0;

      const treasuryBefore = world.dungeon.treasuryCp;
      const teamGoldBefore = teamOf(world, teamId).goldCp;
      killHero(world, heroOf(world, heroId));
      sweepCorpse(world, heroId);

      return {
        tax: world.dungeon.treasuryCp - treasuryBefore,
        widow: teamOf(world, teamId).goldCp - teamGoldBefore,
      };
    };

    const low = takeAt(6_000);
    const high = takeAt(9_500);

    expect(low.tax).toBeLessThan(high.tax);
    expect(low.widow).toBeGreaterThan(high.widow);
    expect(low.tax + low.widow).toBe(high.tax + high.widow);
  });

  it('keeps the whole estate when the crew is gone', () => {
    const { world, heroId, teamId } = estateWorld();
    world.dungeon.corpseTaxBp = 5_000;
    heroOf(world, heroId).goldCp = 800;
    teamOf(world, teamId).carriedCp = 0;

    const treasuryBefore = world.dungeon.treasuryCp;
    killHero(world, heroOf(world, heroId));
    teamOf(world, teamId).state = 'disbanded';
    sweepCorpse(world, heroId);

    expect(world.dungeon.treasuryCp - treasuryBefore).toBe(800);
  });

  it('puts the dead hero share of the carried haul into the estate', () => {
    const { world, heroId, teamId } = estateWorld();
    const team = teamOf(world, teamId);
    team.carriedCp = 900;
    const living = livingRoster(world, team).length;
    const circulatingBefore = circulatingCoin(world);

    killHero(world, heroOf(world, heroId));

    expect(heroOf(world, heroId).goldCp).toBe(Math.floor(900 / living));
    expect(team.carriedCp).toBe(900 - Math.floor(900 / living));
    expect(circulatingCoin(world)).toBe(circulatingBefore);
  });

  it('conserves coin across a kill and sweep', () => {
    const { world, heroId, teamId } = estateWorld();
    teamOf(world, teamId).carriedCp = 640;
    heroOf(world, heroId).goldCp = 210;
    world.initialCoinCp = circulatingCoin(world);

    killHero(world, heroOf(world, heroId));
    sweepCorpse(world, heroId);

    expect(circulatingCoin(world) + world.dungeon.sinkCp).toBe(
      world.initialCoinCp + world.dungeon.mintedCp,
    );
  });

  it('reports the split on the event', () => {
    const { world, heroId, teamId } = estateWorld();
    world.dungeon.corpseTaxBp = 7_500;
    heroOf(world, heroId).goldCp = 400;
    teamOf(world, teamId).carriedCp = 0;

    killHero(world, heroOf(world, heroId));
    world.pendingEvents.length = 0;
    sweepCorpse(world, heroId);

    const levy = world.pendingEvents.find((e) => e.type === 'CORPSE_TAX_LEVIED');
    expect(levy).toBeDefined();
    expect(levy?.payload['estateCp']).toBe(400);
    expect(levy?.payload['taxCp']).toBe(300);
    expect(levy?.payload['widowCp']).toBe(100);
  });
});

describe('rungs and traits', () => {
  it('locks the overseer menu down to tolls and observing', () => {
    const world = worldAt('greedy', 500_000);
    world.dungeon.standing = 5;
    for (const id of ids(world)) {
      expect(['toll_up', 'toll_cut', 'observe']).toContain(id);
    }
  });

  it('locks schemes away from a censured keeper', () => {
    const world = worldAt('greedy', 500_000);
    world.dungeon.standing = 20;
    expect(ids(world)).not.toContain('open_scheme');
    world.dungeon.standing = 50;
    expect(ids(world)).toContain('open_scheme');
  });

  it('marks up guardian hires by half while censured', () => {
    const world = worldAt('content', 500_000);
    const hire = KEEPER_ACTIONS.find((a) => a.id === 'hire_guardian');
    expect(hire).toBeDefined();
    world.dungeon.standing = 50;
    const base = keeperCost(world, hire!);
    world.dungeon.standing = 20;
    expect(keeperCost(world, hire!)).toBe(Math.round(base * 1.5));
  });

  it('doubles trait-favoured action weights', () => {
    expect(traitWeightMult('miserly', 'toll_up')).toBe(2);
    expect(traitWeightMult('miserly', 'toll_cut')).toBe(1);
    expect(traitWeightMult('vain', 'hire_guardian')).toBe(2);
    expect(traitWeightMult('vengeful', 'open_scheme')).toBe(2);
    expect(traitWeightMult('gambler', 'open_scheme')).toBe(1);
  });

  it('aims a vengeful keeper at the last big-haul team', () => {
    const world = worldAt('greedy', 500_000);
    world.dungeon.keeperTrait = 'vengeful';
    const mark = world.teams[world.teams.length - 1];
    expect(mark).toBeDefined();
    world.dungeon.lastBigHaulTeamId = mark!.id;
    maybeStartScheme(world);
    expect(world.dungeon.scheme?.targetTeamId).toBe(mark!.id);
  });
});
