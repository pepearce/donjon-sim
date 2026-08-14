import { describe, expect, it } from 'vitest';
import { DAY_TICKS } from '@donjon/shared';
import { newWorld } from '../src/engine/setup.js';
import { generateFloor, vaultExitSpot } from '../src/gen/floorgen.js';
import { exitVault } from '../src/engine/systems/movement.js';
import { APEX, apexDecayDaily, effectiveDangerCr, isApexRoom, returnToTavern, triumph } from '../src/engine/systems/apex.js';
import { stockFloor } from '../src/engine/systems/restock.js';
import { livingHeroCount } from '../src/engine/systems/recruit.js';
import { chooseAction } from '../src/engine/systems/teamAi.js';
import { step } from '../src/engine/step.js';
import { VAULT_DEPTH, circulatingCoin, livingRoster, roster } from '../src/engine/world.js';
import type { Monster, World } from '../src/engine/types.js';

const SEED = 0xa9e7;

function identity(world: World): number {
  return circulatingCoin(world) + world.dungeon.sinkCp - world.dungeon.mintedCp;
}

function withVault(world: World): void {
  for (let depth = world.floors.length + 1; depth <= VAULT_DEPTH; depth++) {
    world.floors.push(generateFloor(world.seed, depth, world.tick));
  }
}

function findApex(world: World): Monster | undefined {
  return world.monsters.find((m) => m.apex && m.alive);
}

describe('apex boss', () => {
  it('stocks a single apex boss in the vault', () => {
    const world = newWorld(SEED);
    withVault(world);
    const vault = world.floors[VAULT_DEPTH - 1]!;
    stockFloor(world, vault.id);

    const boss = findApex(world);
    expect(boss).toBeDefined();
    expect(boss!.guardian).toBe(true);
    expect(boss!.floorId).toBe(vault.id);
    expect(boss!.roomId).toBe(vault.rooms[vault.stairsRoom]!.id);
    expect(boss!.cr).toBeCloseTo(vault.dangerCr * APEX.crMult, 5);
    expect(world.monsters.filter((m) => m.apex).length).toBe(1);
    expect(world.pendingEvents.some((e) => e.type === 'APEX_SUMMONED')).toBe(true);
  });

  it('marks only the vault as the apex room', () => {
    const world = newWorld(SEED);
    withVault(world);
    const one = world.floors[0]!;
    const ten = world.floors[VAULT_DEPTH - 2]!;
    const vault = world.floors[VAULT_DEPTH - 1]!;
    expect(isApexRoom(one, one.rooms[one.stairsRoom]!)).toBe(false);
    expect(isApexRoom(ten, ten.rooms[ten.stairsRoom]!)).toBe(false);
    expect(isApexRoom(vault, vault.rooms[vault.stairsRoom]!)).toBe(true);
    expect(vault.rooms.length).toBe(1);
  });
});

describe('triumph', () => {
  function setupTriumph(world: World): { boss: Monster } {
    withVault(world);
    const vault = world.floors[VAULT_DEPTH - 1]!;
    stockFloor(world, vault.id);
    const boss = findApex(world)!;
    boss.alive = false;
    boss.hp = 0;
    return { boss };
  }

  it('advances the epoch, pays the hoard, and schedules the rehire', () => {
    const world = newWorld(SEED);
    const { boss } = setupTriumph(world);
    const team = world.teams[0]!;
    const slayer = livingRoster(world, team)[0]!;
    const before = identity(world);
    const standing = world.dungeon.standing;

    triumph(world, team, slayer, boss);

    expect(world.dungeon.apexEpoch).toBe(1);
    expect(world.dungeon.lastTriumphTick).toBe(world.tick);
    expect(team.carriedCp).toBeGreaterThanOrEqual(APEX.hoardCp);
    expect(world.dungeon.standing).toBe(standing - 10);
    expect(identity(world)).toBe(before);
    expect(world.pendingEvents.some((e) => e.type === 'TRIUMPH')).toBe(true);

    const bossRoom = world.floors[VAULT_DEPTH - 1]!.rooms.find((r) => r.id === boss.roomId)!;
    const wakes = world.scheduler.toArray();
    const rehireQueued = wakes.some((w) => w.kind === 'RESTOCK' && w.entityId === bossRoom.id);
    if (roster(world, team).length > 0) {
      expect(team.homeboundTick).toBe(world.tick);
      expect(rehireQueued).toBe(false);
    } else {
      expect(bossRoom.restockDueTick).toBe(world.tick + 1);
      expect(rehireQueued).toBe(true);
    }
  });

  it('hires the next boss when the triumphant team steps out', () => {
    const world = newWorld(SEED);
    const { boss } = setupTriumph(world);
    const vault = world.floors[VAULT_DEPTH - 1]!;
    const team = world.teams[0]!;
    triumph(world, team, livingRoster(world, team)[0]!, boss);
    if (roster(world, team).length === 0) return;

    team.floorId = vault.id;
    team.roomIdx = 0;
    const exit = vaultExitSpot(vault);
    team.tileX = exit[0];
    team.tileY = exit[1];

    exitVault(world, team, vault);

    expect(team.state).toBe('disbanded');
    const bossRoom = vault.rooms[0]!;
    expect(bossRoom.restockDueTick).toBe(world.tick + 1);
    expect(
      world.scheduler.toArray().some((w) => w.kind === 'RESTOCK' && w.entityId === bossRoom.id),
    ).toBe(true);
  });

  it('retired heroes leave the roster and stop counting as living', () => {
    const world = newWorld(SEED);
    const { boss } = setupTriumph(world);
    const team = world.teams[0]!;
    const crew = livingRoster(world, team);
    const slayer = crew[0]!;
    for (const hero of crew) {
      hero.level = 20;
      hero.goldCp = 50_000;
      hero.scarred = true;
    }
    const livingBefore = livingHeroCount(world);
    const before = identity(world);

    triumph(world, team, slayer, boss);

    const retired = world.heroes.filter((h) => h.retiredTick !== null);
    expect(livingHeroCount(world)).toBe(livingBefore - retired.length);
    expect(identity(world)).toBe(before);
    for (const hero of retired) {
      expect(hero.teamId).toBeNull();
      expect(hero.goldCp).toBe(0);
      expect(team.roster.includes(hero.id)).toBe(false);
      expect(world.tavern.includes(hero.id)).toBe(false);
    }
    expect(roster(world, team).length + retired.length).toBe(crew.length);
  });
});

describe('triumphant homecoming', () => {
  it('homebound teams retreat instead of exploring', () => {
    const world = newWorld(SEED);
    const team = world.teams[0]!;
    team.homeboundTick = world.tick;
    expect(chooseAction(world, team)).toBe('RETREAT');
  });

  it('sets the team homebound when survivors remain after a triumph', () => {
    const world = newWorld(SEED);
    withVault(world);
    const vault = world.floors[VAULT_DEPTH - 1]!;
    stockFloor(world, vault.id);
    const boss = findApex(world)!;
    boss.alive = false;
    const team = world.teams[0]!;

    triumph(world, team, livingRoster(world, team)[0]!, boss);

    if (roster(world, team).length > 0) {
      expect(team.homeboundTick).toBe(world.tick);
      expect(team.lastAction).toBe('RETREAT');
    }
  });

  it('disbands at the door and sends survivors back to the tavern pool', () => {
    const world = newWorld(SEED);
    const team = world.teams[0]!;
    const crew = livingRoster(world, team);
    const ids = crew.map((h) => h.id);
    team.homeboundTick = world.tick;
    team.goldCp = 900;

    const one = world.floors[0]!;
    const entry = one.rooms[one.entryRoom]!;
    team.roomIdx = one.entryRoom;
    team.targetRoom = one.entryRoom;
    team.tileX = entry.cx;
    team.tileY = entry.cy;
    team.lastAction = 'RETREAT';
    team.commitUntilTick = 0;
    team.state = 'delving';

    step(world);

    expect(team.state).toBe('disbanded');
    expect(team.homeboundTick).toBeNull();
    expect(team.roster.length).toBe(0);
    for (const id of ids) {
      const hero = world.heroes.find((h) => h.id === id)!;
      expect(hero.teamId).toBeNull();
      expect(world.tavern.includes(id)).toBe(true);
    }
    const types = world.pendingEvents.map((e) => e.type);
    expect(types).toContain('PARTY_EXITED');
    expect(types).toContain('TEAM_DISBANDED');
  });

  it('returnToTavern clears the flag and emits the homecoming', () => {
    const world = newWorld(SEED);
    const team = world.teams[0]!;
    team.homeboundTick = world.tick;

    returnToTavern(world, team);

    expect(team.state).toBe('disbanded');
    expect(team.disbandedTick).toBe(world.tick);
    expect(team.homeboundTick).toBeNull();
    const exited = world.pendingEvents.find((e) => e.type === 'PARTY_EXITED');
    expect(exited?.payload['triumphant']).toBe(1);
  });
});

describe('epoch ramp', () => {
  it('scales deep floors hard and shallow floors barely', () => {
    const world = newWorld(SEED);
    withVault(world);
    const one = world.floors[0]!;
    const vault = world.floors[VAULT_DEPTH - 1]!;

    expect(effectiveDangerCr(world, vault)).toBeCloseTo(vault.dangerCr, 5);

    world.dungeon.apexEpoch = 3;
    const shallowRatio = effectiveDangerCr(world, one) / one.dangerCr;
    const deepRatio = effectiveDangerCr(world, vault) / vault.dangerCr;
    expect(deepRatio).toBeCloseTo(1 + APEX.rampPerEpoch * 3, 5);
    expect(shallowRatio).toBeLessThan(1.01);
    expect(deepRatio).toBeGreaterThan(shallowRatio);
  });

  it('decays one epoch after the quiet period', () => {
    const world = newWorld(SEED);
    world.dungeon.apexEpoch = 2;
    world.dungeon.lastTriumphTick = 0;

    world.tick = APEX.decayDays * DAY_TICKS - 1;
    apexDecayDaily(world);
    expect(world.dungeon.apexEpoch).toBe(2);

    world.tick = APEX.decayDays * DAY_TICKS;
    apexDecayDaily(world);
    expect(world.dungeon.apexEpoch).toBe(1);
    expect(world.dungeon.lastTriumphTick).toBe(world.tick);

    apexDecayDaily(world);
    expect(world.dungeon.apexEpoch).toBe(1);
  });
});
