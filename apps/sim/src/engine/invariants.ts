import { MAX_ROSTER } from '@donjon/shared';
import { circulatingCoin } from './world.js';
import { MAX_LEVEL, type World } from './types.js';
import { levelForXp } from './systems/progression.js';
import { MAX_TEAMS } from './world.js';

export interface Violation {
  id: string;
  detail: string;
}

const LEGAL_TRANSITIONS: Record<string, string[]> = {
  recruiting: ['delving', 'disbanded'],
  delving: ['fighting', 'resting', 'fleeing', 'recruiting', 'disbanded'],
  fighting: ['delving', 'fleeing', 'resting', 'disbanded'],
  fleeing: ['delving', 'resting', 'recruiting', 'disbanded'],
  resting: ['delving', 'fighting', 'fleeing', 'disbanded'],
  disbanded: [],
};

export function legalTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

export function checkAll(world: World): Violation[] {
  const v: Violation[] = [];
  const add = (id: string, detail: string): void => {
    v.push({ id, detail });
  };

  for (const hero of world.heroes) {
    if (hero.hp < 0 || hero.hp > hero.hpMax) add('I2_HP_BOUNDS', `hero ${hero.id} hp ${hero.hp}/${hero.hpMax}`);
    if (hero.state === 'dead' && hero.hp !== 0) add('I2_HP_BOUNDS', `dead hero ${hero.id} hp ${hero.hp}`);
    if (hero.state === 'downed' && hero.hp !== 0) add('I2_HP_BOUNDS', `downed hero ${hero.id} hp ${hero.hp}`);
    if (hero.level > MAX_LEVEL) add('I17_LEVEL_CAP', `hero ${hero.id} level ${hero.level}`);
    if (hero.level !== levelForXp(hero.xp)) add('I17_LEVEL_XP', `hero ${hero.id} level ${hero.level} xp ${hero.xp}`);
    if (hero.xp < 0) add('I17_XP_MONOTONIC', `hero ${hero.id} xp ${hero.xp}`);
    if (hero.goldCp < 0) add('I9_NO_NEGATIVE_MONEY', `hero ${hero.id} gold ${hero.goldCp}`);
    if (hero.state === 'dead') {
      if (hero.diedTick === null) add('I11_DEAD_STAMPED', `hero ${hero.id} has no diedTick`);
      const swept = hero.diedTick !== null && world.tick > hero.diedTick + 60;
      if (swept && hero.items.length > 0) {
        add('I11_DEAD_UNARMED', `hero ${hero.id} kept items past the corpse sweep`);
      }
    }
    for (const n of [hero.hp, hero.xp, hero.level, hero.goldCp]) {
      if (!Number.isFinite(n)) add('I22_NO_NAN', `hero ${hero.id} has a non-finite field`);
    }
  }

  const seenHeroes = new Set<number>();
  for (const team of world.teams) {
    if (team.roster.length > MAX_ROSTER) add('I3_ROSTER_SIZE', `team ${team.id} roster ${team.roster.length}`);
    for (const id of team.roster) {
      if (seenHeroes.has(id)) add('I3_ONE_ROSTER', `hero ${id} is in two rosters`);
      seenHeroes.add(id);
      const hero = world.heroes.find((h) => h.id === id);
      if (hero && hero.teamId !== team.id) add('I3_ROSTER_LINK', `hero ${id} teamId mismatch`);
    }

    if (team.goldCp < 0) add('I9_NO_NEGATIVE_MONEY', `team ${team.id} gold ${team.goldCp}`);
    if (team.carriedCp < 0) add('I9_NO_NEGATIVE_MONEY', `team ${team.id} carried ${team.carriedCp}`);
    if (team.renownMilli < 0) add('I18_RENOWN_NONNEG', `team ${team.id} renown ${team.renownMilli}`);

    if (team.state !== 'disbanded') {
      const floor = world.floors.find((f) => f.id === team.floorId);
      if (!floor) {
        add('I6_TEAM_ON_FLOOR', `team ${team.id} floor ${team.floorId} missing`);
      } else {
        if (!floor.rooms[team.roomIdx]) add('I6_TEAM_IN_ROOM', `team ${team.id} room ${team.roomIdx} missing`);
        const tile = floor.tiles[team.tileY * floor.width + team.tileX];
        if (tile === undefined || tile === 0) {
          add('I23_TEAM_ON_WALKABLE', `team ${team.id} at (${team.tileX},${team.tileY}) on floor ${floor.id}`);
        }
        const d = floor.dist[team.roomIdx * floor.rooms.length + floor.entryRoom] ?? 255;
        if (d === 255) add('I7_EXIT_REACHABLE', `team ${team.id} cannot reach the entry`);
      }
    }

    if (team.state === 'fighting') {
      const floor = world.floors.find((f) => f.id === team.floorId);
      const room = floor?.rooms[team.roomIdx];
      const enemies = room ? world.monsters.filter((m) => m.alive && m.roomId === room.id) : [];
      if (enemies.length === 0) add('I5_FIGHTING_HAS_ENEMY', `team ${team.id} is fighting nothing`);
    }
  }

  const activeTeams = world.teams.filter((t) => t.state !== 'disbanded').length;
  if (activeTeams > MAX_TEAMS) add('I13_TEAM_CAP', `${activeTeams} active teams`);

  const living = world.heroes.filter((h) => h.state !== 'dead').length;
  if (living < 1) add('I12_HEROES_ALIVE', 'no living heroes at all');

  for (const monster of world.monsters) {
    if (monster.hp < 0 || monster.hp > monster.hpMax) {
      add('I14_MONSTER_HP', `monster ${monster.id} hp ${monster.hp}/${monster.hpMax}`);
    }
    if (!monster.alive && monster.hp !== 0) add('I14_MONSTER_HP', `dead monster ${monster.id} hp ${monster.hp}`);
  }

  for (const item of world.items) {
    const owners = [item.ownerHeroId !== null, item.roomId !== null].filter(Boolean).length;
    if (owners > 1) add('I10_ONE_OWNER', `item ${item.id} has two owners`);
  }

  const circulating = circulatingCoin(world);
  if (circulating + world.dungeon.sinkCp !== world.initialCoinCp + world.dungeon.mintedCp) {
    add(
      'I8_COIN_CONSERVATION',
      `circulating ${circulating} + sink ${world.dungeon.sinkCp} != initial ${world.initialCoinCp} + minted ${world.dungeon.mintedCp}`,
    );
  }
  if (world.dungeon.treasuryCp < 0) add('I9_NO_NEGATIVE_MONEY', `treasury ${world.dungeon.treasuryCp}`);
  if (world.dungeon.loanCp > 25_000) add('I20_LOAN_CAP', `loan ${world.dungeon.loanCp}`);
  if (world.dungeon.loanCp < 0) add('I20_LOAN_CAP', `negative loan ${world.dungeon.loanCp}`);

  for (const wake of world.scheduler.toArray()) {
    if (wake.dueTick < world.tick) add('I15_NO_STALE_WAKE', `${wake.kind} due ${wake.dueTick} < tick ${world.tick}`);
    if (wake.dueTick > world.tick + 100_000) add('I16_NO_FAR_WAKE', `${wake.kind} due ${wake.dueTick}`);
  }

  const depths = world.floors.map((f) => f.depth).sort((a, b) => a - b);
  depths.forEach((depth, i) => {
    if (depth !== i + 1) add('I19_FLOORS_CONTIGUOUS', `floor depths ${depths.join(',')}`);
  });

  for (const n of [world.dungeon.treasuryCp, world.dungeon.mintedCp, world.dungeon.sinkCp]) {
    if (!Number.isFinite(n)) add('I22_NO_NAN', 'dungeon has a non-finite field');
  }

  return v;
}

export function assertNoViolations(world: World): void {
  const violations = checkAll(world);
  if (violations.length > 0) {
    const summary = violations
      .slice(0, 5)
      .map((v) => `${v.id}: ${v.detail}`)
      .join('; ');
    throw new Error(`${violations.length} invariant violation(s) at tick ${world.tick}: ${summary}`);
  }
}
