import { describe, expect, it } from 'vitest';
import { newWorld } from '../src/engine/setup.js';
import { step } from '../src/engine/step.js';
import { doctrineFor, driftMorale, moraleBaseline, roomNoise } from '../src/engine/systems/doctrine.js';
import { chooseDestination } from '../src/engine/systems/movement.js';
import { buildContext, score } from '../src/engine/systems/teamAi.js';
import { canCamp, restAndHeal } from '../src/engine/systems/economy.js';
import { floorOf, livingRoster } from '../src/engine/world.js';
import type { World } from '../src/engine/types.js';

const SEED = 0xd0f0a;

function run(ticks: number): World {
  const world = newWorld(SEED);
  for (let i = 0; i < ticks; i++) step(world);
  return world;
}

function crewedTeam(world: World) {
  const team = world.teams.find((t) => t.state !== 'disbanded' && livingRoster(world, t).length > 0);
  expect(team).toBeDefined();
  return team!;
}

describe('doctrine', () => {
  it('is stable for a team across separate worlds built from the same seed', () => {
    const a = run(2_000);
    const b = run(2_000);
    for (const team of a.teams) {
      const other = b.teams.find((t) => t.id === team.id);
      expect(other).toBeDefined();
      expect(doctrineFor(a, team)).toEqual(doctrineFor(b, other!));
    }
  });

  it('produces every weight inside the unit interval', () => {
    const world = run(3_000);
    for (const team of world.teams) {
      const d = doctrineFor(world, team);
      for (const value of [d.wanderlust, d.avarice, d.caution, d.patience]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives different teams different room preferences', () => {
    const distinct = new Set<number>();
    for (let teamId = 1; teamId <= 8; teamId++) distinct.add(roomNoise(SEED, teamId, 1, 7));
    expect(distinct.size).toBe(8);
  });

  it('room noise is constant for a given team and room', () => {
    expect(roomNoise(SEED, 3, 1, 7)).toBe(roomNoise(SEED, 3, 1, 7));
  });
});

describe('destination choice', () => {
  it('does not funnel every team on a floor to the same room', () => {
    const world = run(4_000);
    const byFloor = new Map<number, typeof world.teams>();
    for (const team of world.teams) {
      if (team.state === 'disbanded') continue;
      const list = byFloor.get(team.floorId) ?? [];
      list.push(team);
      byFloor.set(team.floorId, list);
    }

    let contested = 0;
    let shared = 0;
    for (const [floorId, teams] of byFloor) {
      if (teams.length < 2) continue;
      const floor = floorOf(world, floorId);
      if (!floor) continue;
      const picks = teams.map((t) => chooseDestination(world, t, floor));
      contested += 1;
      if (new Set(picks).size < picks.length) shared += 1;
    }

    if (contested > 0) expect(shared / contested).toBeLessThan(0.5);
  });
});

describe('resource management', () => {
  it('a broke team in a cleared, empty room can still recover', () => {
    const world = run(1_000);
    const team = crewedTeam(world);

    const floor = floorOf(world, team.floorId)!;
    const room = floor.rooms[team.roomIdx]!;
    room.state = 'cleared';
    for (const monster of world.monsters) {
      if (monster.floorId === team.floorId && monster.roomId === room.id) monster.alive = false;
    }
    team.goldCp = 0;
    team.rations = 20;

    expect(canCamp(world, team)).toBe(true);

    const ctx = buildContext(world, team, floor);
    expect(ctx.canAffordRest).toBe(false);
    expect(ctx.canRecover).toBe(true);
  });

  it('camping raises hp without spending gold', () => {
    const world = run(1_000);
    const team = crewedTeam(world);
    const floor = floorOf(world, team.floorId)!;
    const room = floor.rooms[team.roomIdx]!;
    room.state = 'cleared';
    for (const monster of world.monsters) {
      if (monster.floorId === team.floorId && monster.roomId === room.id) monster.alive = false;
    }
    team.goldCp = 0;
    team.rations = 40;

    const crew = livingRoster(world, team);
    for (const hero of crew) hero.hp = 1;
    const before = crew.reduce((n, h) => n + h.hp, 0);

    restAndHeal(world, team);

    const after = livingRoster(world, team).reduce((n, h) => n + h.hp, 0);
    expect(after).toBeGreaterThan(before);
    expect(team.goldCp).toBe(0);
  });

  it('refuses to descend at low hp', () => {
    const world = run(1_000);
    const team = crewedTeam(world);
    const floor = floorOf(world, team.floorId)!;

    for (const hero of livingRoster(world, team)) hero.hp = hero.hpMax;
    const healthy = buildContext(world, team, floor);
    for (const hero of livingRoster(world, team)) hero.hp = Math.max(1, Math.round(hero.hpMax * 0.25));
    const hurt = buildContext(world, team, floor);

    expect(hurt.hpFrac).toBeLessThan(healthy.hpFrac);
    expect(score(hurt, 0).DESCEND).toBeLessThan(score(healthy, 0).DESCEND);
  });

  it('morale drifts up toward the baseline from a collapse', () => {
    const world = run(2_000);
    const team = crewedTeam(world);
    const baseline = moraleBaseline(world, team, doctrineFor(world, team));

    team.morale = 5;
    for (let i = 0; i < 10; i++) driftMorale(world);
    expect(team.morale).toBe(15);

    for (let i = 0; i < 200; i++) driftMorale(world);
    expect(Math.abs(team.morale - baseline)).toBeLessThanOrEqual(1);
  });

  it('morale drifts down toward the baseline from elation', () => {
    const world = run(2_000);
    const team = crewedTeam(world);
    const baseline = moraleBaseline(world, team, doctrineFor(world, team));

    team.morale = 100;
    for (let i = 0; i < 200; i++) driftMorale(world);
    expect(Math.abs(team.morale - baseline)).toBeLessThanOrEqual(1);
  });
});
