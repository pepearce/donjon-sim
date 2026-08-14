import { RngDomain, rngFor, type Rng } from '@donjon/shared';
import { emit } from '../emit.js';
import { floorOf, itemsOf, livingRoster, monstersIn, roster } from '../world.js';
import { BLEED_OUT_TICKS, clamp, pickWeighted, pushHistory, statMod, type Hero, type Monster, type Team, type World } from '../types.js';
import { triumph } from './apex.js';
import { awardXp } from './progression.js';
import { dropLoot } from './loot.js';
import { awardEpithet } from './epithets.js';
import { lineOf } from './formation.js';
import { griefMultiplier, linkAllPairs, linkPair } from './relations.js';
import { setRecord } from './records.js';
import { hasTrait, traitCount } from './traits.js';

function gearTotal(world: World, hero: Hero, key: 'atk' | 'def' | 'dr'): number {
  return itemsOf(world, hero).reduce((n, i) => n + i[key], 0);
}

export function heroAtk(world: World, hero: Hero): number {
  const reckless = hasTrait(hero, 'reckless') ? 2 : 0;
  return 6 + Math.floor(hero.level * 0.6) + statMod(hero.stats[hero.primary]) + gearTotal(world, hero, 'atk') + reckless;
}

export function heroDef(world: World, hero: Hero): number {
  const reckless = hasTrait(hero, 'reckless') ? 2 : 0;
  return 6 + Math.floor(hero.level * 0.4) + statMod(hero.stats.agi) + gearTotal(world, hero, 'def') - reckless;
}

export function heroDr(world: World, hero: Hero): number {
  return Math.min(6, gearTotal(world, hero, 'dr'));
}

function hitDc(attackerAtk: number, defenderDef: number): number {
  return clamp(2, 19, 8 + defenderDef - attackerAtk);
}

function roll(rng: Rng, count: number, sides: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += rng.int(1, sides);
  return total;
}

export function wageForCr(cr: number): number {
  return Math.round(12 * cr ** 1.25);
}

export function monsterFromCr(world: World, name: string, cr: number, roomId: number, floorId: number, guardian: boolean, apex = false): Monster {
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
    wageCpPerDay: wageForCr(cr),
    roomId,
    floorId,
    guardian,
    apex,
    alive: true,
  };
}

function killMonster(world: World, team: Team, hero: Hero, target: Monster, damage: number): void {
  target.alive = false;
  target.hp = 0;
  hero.kills += 1;
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

  if (target.apex) triumph(world, team, hero, target);

  if (hero.className === 'cutpurse') {
    const skimCp = Math.max(1, Math.round(2 * target.cr));
    team.carriedCp += skimCp;
    world.dungeon.mintedCp += skimCp;
    emit(world, {
      type: 'HERO_SKIM',
      teamId: team.id,
      heroId: hero.id,
      floorId: team.floorId,
      payload: { hero: hero.name, monster: target.name, cp: skimCp },
    });
  }

  if (hero.kills >= 10) awardEpithet(world, hero, 'kills10');
  setRecord(world, 'kills', 'most kills by one hero', hero.kills, hero.name, team);
}

function rescueChance(helper: Hero, base: number, pretreBonus = 0): number {
  return clamp(
    0.1,
    0.9,
    base +
      0.05 * statMod(helper.stats.wil) +
      (helper.className === 'pretre' ? pretreBonus : 0) +
      0.02 * helper.level +
      (hasTrait(helper, 'loyal') ? 0.12 : 0) +
      (hasTrait(helper, 'pious') ? 0.08 : 0),
  );
}

function reviveHero(world: World, team: Team, saviour: Hero, patient: Hero): void {
  patient.state = 'ok';
  patient.hp = 1;
  patient.scarred = true;
  world.scheduler.cancel('BLEED_OUT', patient.id);
  team.morale = clamp(0, 100, team.morale + 4);
  linkPair(world, saviour, patient, 25);
}

function pretreAid(world: World, team: Team, hero: Hero): boolean {
  const rng = rngFor(world.seed, world.tick, RngDomain.ACT_AID, hero.id);

  const downed = roster(world, team).filter((h) => h.state === 'downed');
  const patient = downed[0];
  if (patient) {
    if (rng.chance(rescueChance(hero, 0.6))) {
      reviveHero(world, team, hero, patient);
      emit(world, {
        type: 'HERO_AID',
        teamId: team.id,
        heroId: hero.id,
        floorId: team.floorId,
        payload: { hero: hero.name, ally: patient.name, saved: 1 },
      });
    }
    return true;
  }

  const wounded = livingRoster(world, team)
    .filter((h) => h.id !== hero.id && h.hp / h.hpMax < 0.5)
    .sort((a, b) => a.hp / a.hpMax - b.hp / b.hpMax);
  const ally = wounded[0];
  if (!ally) return false;

  const amount = Math.min(
    ally.hpMax - ally.hp,
    rng.int(1, 6) + Math.max(0, statMod(hero.stats.wil)),
  );
  if (amount <= 0) return false;
  ally.hp += amount;
  emit(world, {
    type: 'HERO_AID',
    teamId: team.id,
    heroId: hero.id,
    floorId: team.floorId,
    payload: { hero: hero.name, ally: ally.name, amount },
  });
  return true;
}

const ENGAGE_COMMIT_TICKS = 10;

export function startCombat(world: World, team: Team): void {
  const floor = floorOf(world, team.floorId);
  const room = floor?.rooms[team.roomIdx];
  if (!floor || !room) return;
  const enemies = monstersIn(world, floor.id, team.roomIdx);
  if (enemies.length === 0) return;

  team.state = 'fighting';
  team.commitUntilTick = world.tick + ENGAGE_COMMIT_TICKS;
  emit(world, {
    type: 'COMBAT_START',
    teamId: team.id,
    floorId: floor.id,
    roomId: room.id,
    payload: { room: room.name, enemies: enemies.length, lead: enemies[0]?.name ?? 'something' },
  });
  sapperCharge(world, team);
}

export function sapperCharge(world: World, team: Team): void {
  const sappers = livingRoster(world, team).filter((h) => h.className === 'sapper');
  for (const sapper of sappers) {
    const enemies = monstersIn(world, team.floorId, team.roomIdx);
    if (enemies.length === 0) return;
    const rng = rngFor(world.seed, world.tick, RngDomain.COMBAT_DMG, sapper.id);
    let dealt = 0;
    let downs = 0;
    for (const monster of enemies) {
      const damage = Math.max(1, rng.int(1, 6) + Math.floor(sapper.level / 3) - monster.dr);
      monster.hp -= damage;
      dealt += damage;
      if (monster.hp <= 0) {
        downs += 1;
        killMonster(world, team, sapper, monster, damage);
      }
    }
    emit(world, {
      type: 'HERO_BLAST',
      teamId: team.id,
      heroId: sapper.id,
      floorId: team.floorId,
      payload: { hero: sapper.name, damage: dealt, hit: enemies.length, downed: downs },
    });
  }
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
      if (monstersIn(world, team.floorId, team.roomIdx).length === 0) break;

      if (hero.className === 'pretre' && pretreAid(world, team, hero)) continue;

      const targetRng = rngFor(world.seed, world.tick, RngDomain.COMBAT_TARGET_WEIGHT, hero.id);
      const hitRng = rngFor(world.seed, world.tick, RngDomain.COMBAT_HIT, hero.id);
      const dmgRng = rngFor(world.seed, world.tick, RngDomain.COMBAT_DMG, hero.id);
      const arcRng = rngFor(world.seed, world.tick, RngDomain.ACT_ARC, hero.id);

      let strikes = 1;
      let riposted = false;
      while (strikes > 0) {
        strikes -= 1;
        const targets = monstersIn(world, team.floorId, team.roomIdx);
        if (targets.length === 0) break;

        const weights = targets.map((m) => {
          let w = 1;
          if (hero.nemesisName !== '' && m.name === hero.nemesisName) w *= hasTrait(hero, 'vengeful') ? 12 : 2;
          if (m.guardian && hasTrait(hero, 'glory_hound')) w *= 2;
          return w;
        });
        const target = pickWeighted(targets, weights, targetRng);
        if (!target) break;

        const d20 = hitRng.int(1, 20);
        if (d20 === 1) continue;
        const crit = d20 === 20;
        const luck = hasTrait(hero, 'lucky') ? 1 : 0;
        if (!crit && d20 + luck < hitDc(heroAtk(world, hero), target.def)) continue;

        const dice = roll(dmgRng, crit ? 2 : 1, 6);
        const raw = dice + statMod(hero.stats[hero.primary]) + Math.floor(hero.level / 3);
        const damage = Math.max(1, crit ? raw : raw - target.dr);
        target.hp -= damage;
        damageDealt += damage;

        if (hero.className === 'thaumaturge' && targets.length > 1) {
          const others = targets.filter((m) => m.id !== target.id && m.alive);
          const splashTarget = others[arcRng.int(0, Math.max(0, others.length - 1))];
          if (splashTarget) {
            const splash = Math.max(1, Math.floor(damage / 2));
            splashTarget.hp -= splash;
            damageDealt += splash;
            emit(world, {
              type: 'HERO_ARC',
              teamId: team.id,
              heroId: hero.id,
              floorId: team.floorId,
              payload: { hero: hero.name, monster: target.name, other: splashTarget.name, damage: splash },
            });
            if (splashTarget.hp <= 0) {
              monstersDown += 1;
              killMonster(world, team, hero, splashTarget, splash);
            }
          }
        }

        if (target.hp <= 0 && target.alive) {
          monstersDown += 1;
          killMonster(world, team, hero, target, damage);
          if (hero.className === 'sabreur' && !riposted) {
            riposted = true;
            strikes += 1;
            emit(world, {
              type: 'HERO_RIPOSTE',
              teamId: team.id,
              heroId: hero.id,
              floorId: team.floorId,
              payload: { hero: hero.name, monster: target.name },
            });
          }
        }
      }
    } else {
      const monster = enemies.find((m) => m.id === actor.id);
      if (!monster || !monster.alive) continue;
      const candidates = livingRoster(world, team);
      if (candidates.length === 0) break;

      const targetRng = rngFor(world.seed, world.tick, RngDomain.COMBAT_TARGET, monster.id + 100_000);
      const anyFrontUp = candidates.some((h) => lineOf(h) === 'front');
      const weights = candidates.map((h) => {
        let w = 1;
        if (h.hp / h.hpMax < 0.35) w *= 1.6;
        if (heroDef(world, h) >= 14) w *= 0.6;
        if (anyFrontUp && lineOf(h) === 'back') w *= 0.35;
        return w;
      });
      let victim = pickWeighted(candidates, weights, targetRng);
      if (!victim) continue;

      if (lineOf(victim) === 'back') {
        const ward = victim;
        const guard = candidates.find(
          (h) => h.className === 'bruiser' && h.id !== ward.id && lineOf(h) === 'front',
        );
        if (guard) {
          const shieldRng = rngFor(world.seed, world.tick, RngDomain.ACT_SHIELD, monster.id + 100_000);
          if (shieldRng.chance(0.35)) {
            emit(world, {
              type: 'HERO_SHIELDED',
              teamId: team.id,
              heroId: guard.id,
              floorId: team.floorId,
              payload: { hero: guard.name, ward: victim.name, monster: monster.name },
            });
            victim = guard;
          }
        }
      }

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
    if (rng.chance(rescueChance(helper, 0.45, 0.15))) {
      reviveHero(world, team, helper, hero);
    }
  }
}
