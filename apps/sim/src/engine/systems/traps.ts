import { RngDomain, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { TRAP_NAMES } from '../tables.js';
import { livingRoster } from '../world.js';
import { hasTrait } from './traits.js';
import { BLEED_OUT_TICKS, clamp, statMod, type Room, type Team, type World } from '../types.js';

export function armTrap(world: World, room: Room, depth: number): void {
  const rng = rngFor(world.seed, world.tick, RngDomain.TRAP_ROLL, room.id);
  if (!rng.chance(0.28)) {
    room.trapTier = 0;
    room.trapState = 'none';
    return;
  }
  room.trapTier = clamp(1, 6, Math.round(1 + depth * 0.6 + rng.int(0, 1)));
  room.trapState = 'armed';
}

export function resolveTrap(world: World, team: Team, room: Room): void {
  if (room.trapState !== 'armed') return;
  const living = livingRoster(world, team);
  if (living.length === 0) return;

  const rng = rngFor(world.seed, world.tick, RngDomain.TRAP_ROLL, team.id * 1000 + room.id);
  const careful = living.filter((h) => hasTrait(h, 'cautious'));
  const pool = careful.length > 0 ? careful : living;
  const scout = pool.reduce((best, h) => (h.stats.agi > best.stats.agi ? h : best), pool[0]!);
  const disarmChance = clamp(
    0.05,
    0.9,
    0.3 +
      0.05 * statMod(scout.stats.agi) +
      (scout.className === 'sapper' ? 0.25 : 0) +
      (hasTrait(scout, 'cautious') ? 0.12 : 0),
  );

  if (rng.chance(disarmChance)) {
    room.trapState = 'disarmed';
    team.renownMilli += 4 * room.trapTier * 1000;
    emit(world, {
      type: 'TRAP_DISARMED',
      teamId: team.id,
      heroId: scout.id,
      floorId: team.floorId,
      roomId: room.id,
      payload: { hero: scout.name, tier: room.trapTier, trap: rng.pick(TRAP_NAMES) },
    });
    return;
  }

  const victim = rng.pick(living);
  const damage = Math.max(1, rng.int(1, 4 + room.trapTier * 2) + room.trapTier);
  victim.hp -= damage;
  room.trapState = 'sprung';
  team.morale = clamp(0, 100, team.morale - 6);

  const lethal = victim.hp <= 0;
  if (lethal) {
    victim.hp = 0;
    victim.state = 'downed';
    victim.bleedOutTick = world.tick + BLEED_OUT_TICKS;
    world.scheduler.schedule(victim.bleedOutTick, 'BLEED_OUT', victim.id);
  }

  world.scheduler.schedule(world.tick + Math.round(600 * room.trapTier ** 0.5), 'TRAP_REARM', room.id);

  emit(world, {
    type: 'TRAP_SPRUNG',
    teamId: team.id,
    heroId: victim.id,
    floorId: team.floorId,
    roomId: room.id,
    payload: { hero: victim.name, damage, tier: room.trapTier, trap: rng.pick(TRAP_NAMES), lethal: lethal ? 1 : 0 },
  });
}
