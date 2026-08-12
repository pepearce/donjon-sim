import { emit } from '../emit.js';
import { livingRoster } from '../world.js';
import { MAX_LEVEL, clamp, xpToNext, type Team, type World } from '../types.js';

export function levelForXp(xp: number): number {
  let level = 1;
  let spent = 0;
  while (level < MAX_LEVEL) {
    const need = xpToNext(level);
    if (xp < spent + need) break;
    spent += need;
    level += 1;
  }
  return level;
}

export function awardXp(world: World, team: Team, monsterXp: number): void {
  const living = livingRoster(world, team);
  if (living.length === 0) return;
  const floor = world.floors.find((f) => f.id === team.floorId);
  const meanLevel = living.reduce((n, h) => n + h.level, 0) / living.length;
  const meanCr = floor?.dangerCr ?? 1;
  const scale = clamp(0.2, 2.0, 1.5 ** (meanCr - meanLevel));
  const share = Math.max(1, Math.round((monsterXp * scale) / living.length));

  for (const hero of living) {
    hero.xp += share;
    const next = levelForXp(hero.xp);
    if (next > hero.level) {
      const gained = next - hero.level;
      hero.level = next;
      hero.hpMax += 4 * gained;
      hero.hp = Math.min(hero.hpMax, hero.hp + 4 * gained);
      emit(world, {
        type: 'HERO_LEVEL_UP',
        teamId: team.id,
        heroId: hero.id,
        floorId: team.floorId,
        payload: { hero: hero.name, level: hero.level },
      });
    }
  }
}
