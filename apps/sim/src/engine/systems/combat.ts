import { RngDomain, rngFor, type Rng } from '@donjon/shared';
import { emit } from '../emit.js';
import { floorOf, itemsOf, livingRoster, monstersIn, roster } from '../world.js';
import { BLEED_OUT_TICKS, clamp, pushHistory, statMod, type Hero, type Monster, type Team, type World } from '../types.js';
import { awardXp } from './progression.js';
import { dropLoot } from './loot.js';
import { awardEpithet } from './epithets.js';
import { griefMultiplier, linkAllPairs, linkPair } from './relations.js';
import { setRecord } from './records.js';
import { hasTrait, traitCount } from './traits.js';

export function heroAtk(world: World, hero: Hero): number {
  const gear = itemsOf(world, hero).reduce((n, i) => n + i.atk, 0);
  const reckless = hasTrait(hero, 'reckless') ? 2 : 0;
  return 6 + Math.floor(hero.level * 0.6) + statMod(hero.stats[hero.primary]) + gear + reckless;
}

export function heroDef(world: World, hero: Hero): number {
  const gear = itemsOf(world, hero).reduce((n, i) => n + i.def, 0);
  const reckless = hasTrait(hero, 'reckless') ? 2 : 0;
  return 6 + Math.floor(hero.level * 0.4) + statMod(hero.stats.agi) + gear - reckless;
}

export function heroDr(world: World, hero: Hero): number {
  return Math.min(6, itemsOf(world, hero).reduce((n, i) => n + i.dr, 0));
}

function hitDc(attackerAtk: number, defenderDef: number): number {
  return clamp(2, 19, 8 + defenderDef - attackerAtk);
}

function roll(rng: Rng, count: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += rng.int(1, sides);
  return total;
}

export function monsterFromCr(world: World, name: string, cr: number, roomId: number, floorId: number, guardian: boolean): Monster {
  const hpMax = Math.round(8 + 7 * cr);
  return {
    id: world.nextMonsterId++,
    name,
    cr,
    hp: hpMax,
    hpMax,
    atk: Math.round(6 + 1.2 * cr),
    def: Math.round(7 + cr),
    dr: Math.floor(cr / 3),
    dmgSides: 3 + Math.min(Math.round(cr), 6),
    dmgBonus: Math.floor(cr / 2),
    xp: Math.round(45 * cr ** 1.4),
    wageCpPerDay: Math.round(12 * cr ** 1.25),
    roomId,
    floorId,
    guardian,
    alive: true,
  };
}

function downHero(world: World, hero: Hero, team: Team, source: string): void {
  hero.hp = 0;
  hero.state = 'downed';
  hero.bleedOutTick = world.tick + BLEED_OUT_TICKS;
  world.scheduler.schedule(hero.bleedOutTick, 'BLEED_OUT', hero.id);

  const crew = livingRoster(world, team);
  const grief = griefMultiplier(crew, hero.id);
  team.morale = clamp(0, 100, team.morale - Math.round(12 * grief) - 2 * traitCount(crew, 'superstitious'));

  if (hero.nemesisName === '') {
    hero.nemesisName = source;
    hero.nemesisDowns = 1;
    emit(world, {
      type: 'HERO_NEMESIS_SET',
      teamId: team.id,
      heroId: hero.id,
      floorId: team.floorId,
      payload: { hero: hero.name, monster: source },
    });
  } else if (hero.nemesisName === source) {
    hero.nemesisDowns += 1;
  }

  emit(world, {
    type: 'HERO_DOWN',
    teamId: team.id,
    heroId: hero.id,
    floorId: team.floorId,
    payload: { hero: hero.name, source },
  });
}

export function resolveCombatRound(world: World, team: Team): void {
  const enemies = monstersIn(world, team.floorId, team.roomIdx);
  if (enemies.length === 0) {
    team.state = 'delving';
    emit(world, { type: 'COMBAT_END', teamId: team.id, floorId: team.floorId, payload: {} });
    return;
  }

  const living = livingRoster(world, team);
  if (living.length === 0) return;

  const initRng = rngFor(world.seed, world.tick, RngDomain.COMBAT_INIT, team.id);
  type Actor = { kind: 'hero' | 'monster'; id: number; init: number };
  const order: Actor[] = [];
  for (const hero of living) order.push({ kind: 'hero', id: hero.id, init: hero.stats.agi + initRng.int(1, 6) });
  for (const monster of enemies) order.push({ kind: 'monster', id: monster.id, init: monster.def + initRng.int(1, 6) });
  order.sort((a, b) => b.init - a.init || a.id - b.id);

  let damageDealt = 0;
  let monstersDown = 0;

  for (const actor of order) {
    if (actor.kind === 'hero') {
      const hero = living.find((h) => h.id === actor.id);
      if (!hero || hero.state !== 'ok') continue;
      const targets = monstersIn(world, team.floorId, team.roomIdx);
      if (targets.length === 0) break;

      const targetRng = rngFor(world.seed, world.tick, RngDomain.COMBAT_TARGET_WEIGHT, hero.id);
      const weights = targets.map((m) => {
        let w = 1;
        if (hero.nemesisName !== '' && m.name === hero.nemesisName) w *= hasTrait(hero, 'vengeful') ? 12 : 2;
        if (m.guardian && hasTrait(hero, 'glory_hound')) w *= 2;
        return w;
      });
      const targetWeight = weights.reduce((a, b) => a + b, 0);
      let targetPoint = targetRng.float() * targetWeight;
      let target = targets[0];
      for (let i = 0; i < targets.length; i++) {
        targetPoint -= weights[i] ?? 0;
        if (targetPoint <= 0) {
          target = targets[i];
          break;
        }
      }
      if (!target) continue;

      const hitRng = rngFor(world.seed, world.tick, RngDomain.COMBAT_HIT, hero.id);
      const d20 = hitRng.int(1, 20);
      if (d20 === 1) continue;
      const crit = d20 === 20;
      const luck = hasTrait(hero, 'lucky') ? 1 : 0;
      if (!crit && d20 + luck < hitDc(heroAtk(world, hero), target.def)) continue;

      const dmgRng = rngFor(world.seed, world.tick, RngDomain.COMBAT_DMG, hero.id);
      const dice = roll(dmgRng, crit ? 2 : 1, 6);
      const raw = dice + statMod(hero.stats[hero.primary]) + Math.floor(hero.level / 3);
      const damage = Math.max(1, crit ? raw : raw - target.dr);
      target.hp -= damage;
      damageDealt += damage;

      if (target.hp <= 0) {
        target.alive = false;
        target.hp = 0;
        hero.kills += 1;
        monstersDown += 1;
        awardXp(world, team, target.xp);
        emit(world, {
          type: 'MONSTER_DOWN',
          teamId: team.id,
          heroId: hero.id,
          floorId: team.floorId,
          payload: { hero: hero.name, monster: target.name, damage },
        });

        if (hero.nemesisName !== '' && target.name === hero.nemesisName) {
          emit(world, {
            type: 'HERO_NEMESIS_SLAIN',
            teamId: team.id,
            heroId: hero.id,
            floorId: team.floorId,
            payload: { hero: hero.name, monster: target.name, downs: hero.nemesisDowns },
          });
          hero.nemesisName = '';
          hero.nemesisDowns = 0;
          awardEpithet(world, hero, 'nemesis');
        }

        if (target.guardian) {
          const depth = floorOf(world, team.floorId)?.depth ?? 1;
          pushHistory(
            team,
            world.tick,
            'boss',
            `${hero.name} put down the ${target.name} that held floor ${depth}.`,
          );
        }

        if (hero.kills >= 10) awardEpithet(world, hero, 'kills10');
        setRecord(world, 'kills', 'most kills by one hero', hero.kills, hero.name, team);
      }
    } else {
      const monster = enemies.find((m) => m.id === actor.id);
      if (!monster || !monster.alive) continue;
      const candidates = livingRoster(world, team);
      if (candidates.length === 0) break;

      const targetRng = rngFor(world.seed, world.tick, RngDomain.COMBAT_TARGET, monster.id + 100_000);
      const weights = candidates.map((h) => {
        let w = 1;
        if (h.hp / h.hpMax < 0.35) w *= 1.6;
        if (heroDef(world, h) >= 14) w *= 0.6;
        return w;
      });
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let pickPoint = targetRng.float() * totalWeight;
      let victim = candidates[0];
      for (let i = 0; i < candidates.length; i++) {
        pickPoint -= weights[i] ?? 0;
        if (pickPoint <= 0) {
          victim = candidates[i];
          break;
        }
      }
      if (!victim) continue;

      const hitRng = rngFor(world.seed, world.tick, RngDomain.COMBAT_HIT, monster.id + 100_000);
      const d20 = hitRng.int(1, 20);
      if (d20 === 1) continue;
      const crit = d20 === 20;
      if (!crit && d20 < hitDc(monster.atk, heroDef(world, victim))) continue;

      const dmgRng = rngFor(world.seed, world.tick, RngDomain.COMBAT_DMG, monster.id + 100_000);
      const dice = roll(dmgRng, crit ? 2 : 1, monster.dmgSides);
      const raw = dice + monster.dmgBonus;
      const damage = Math.max(1, crit ? raw : raw - heroDr(world, victim));
      victim.hp -= damage;

      if (victim.hp <= 0) downHero(world, victim, team, monster.name);
    }
  }

  emit(world, {
    type: 'COMBAT_ROUND',
    teamId: team.id,
    floorId: team.floorId,
    payload: { damage: damageDealt, downed: monstersDown },
  });

  const remaining = monstersIn(world, team.floorId, team.roomIdx);
  if (remaining.length === 0) {
    const floor = world.floors.find((f) => f.id === team.floorId);
    const room = floor?.rooms[team.roomIdx];
    if (room && room.state === 'stocked') {
      room.state = 'cleared';
      dropLoot(world, team, room);
      const survivors = livingRoster(world, team);
      linkAllPairs(world, survivors, 2);
      team.morale = clamp(0, 100, team.morale + 6 + 2 * traitCount(survivors, 'superstitious'));
      team.renownMilli += Math.round(8 * (floor?.depth ?? 1) * 1000);
      emit(world, {
        type: 'ROOM_CLEARED',
        teamId: team.id,
        floorId: team.floorId,
        roomId: room.id,
        payload: { room: room.name },
      });
    }
    team.state = 'delving';
    emit(world, { type: 'COMBAT_END', teamId: team.id, floorId: team.floorId, payload: {} });
  }
}

export function attemptStabilise(world: World, team: Team): void {
  const downed = roster(world, team).filter((h) => h.state === 'downed');
  if (downed.length === 0) return;
  const helpers = livingRoster(world, team);
  if (helpers.length === 0) return;

  for (const hero of downed) {
    const helper = helpers.find((h) => hasTrait(h, 'loyal')) ?? helpers[0];
    if (!helper) break;
    const rng = rngFor(world.seed, world.tick, RngDomain.STABILIZE, hero.id);
    const p = clamp(
      0.1,
      0.9,
      0.45 +
        0.05 * statMod(helper.stats.wil) +
        (helper.className === 'pretre' ? 0.15 : 0) +
        0.02 * helper.level +
        (hasTrait(helper, 'loyal') ? 0.12 : 0) +
        (hasTrait(helper, 'pious') ? 0.08 : 0),
    );
    if (rng.chance(p)) {
      hero.state = 'ok';
      hero.hp = 1;
      hero.scarred = true;
      world.scheduler.cancel('BLEED_OUT', hero.id);
      team.morale = clamp(0, 100, team.morale + 4);
      linkPair(world, helper, hero, 25);
    }
  }
}
