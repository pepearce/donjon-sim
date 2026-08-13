import { RngDomain, rngFor } from '@donjon/shared';
import { emit } from '../emit.js';
import { ITEMS } from '../tables.js';
import { livingRoster } from '../world.js';
import { ECON } from './economy.js';
import { LEAN_TREASURY_CP } from './restock.js';
import { hasTrait } from './traits.js';
import { RARITY_BASE_CP, RARITY_NAMES, type Hero, type Item, type Rarity, type Room, type Team, type World } from '../types.js';

function bearerRank(hero: Hero): number {
  if (hasTrait(hero, 'greedy')) return 0;
  if (hasTrait(hero, 'hoarder')) return 1;
  return 2;
}

export function rarityWeights(depth: number): number[] {
  return [
    100,
    22 + 3 * depth,
    4 + 1.6 * depth,
    0.5 + 0.5 * depth,
    depth >= 5 ? 0.02 * depth ** 1.5 : 0,
  ];
}

export function restockCostFactor(circulating: number): number {
  return Math.min(2.0, Math.max(0.35, (circulating / ECON.coinSetpoint) ** 0.8));
}

export function rollRarity(depth: number, u: number): Rarity {
  const weights = rarityWeights(depth);
  const total = weights.reduce((a, b) => a + b, 0);
  let point = u * total;
  for (let i = 0; i < weights.length; i++) {
    point -= weights[i] ?? 0;
    if (point <= 0) return i as Rarity;
  }
  return 0;
}

export function makeItem(world: World, depth: number, roomId: number | null): Item {
  const rng = rngFor(world.seed, world.tick, RngDomain.LOOT_ROLL, world.nextItemId);
  const rarity = rollRarity(depth, rng.float());
  const archetype = rng.pick(ITEMS);
  const base = RARITY_BASE_CP[rarity] ?? 40;
  const valueCp = Math.round(base * (0.75 + 0.5 * rng.float()) * (1 + 0.08 * depth));

  const item: Item = {
    id: world.nextItemId++,
    name: rarity >= 2 ? `${archetype.name} (${RARITY_NAMES[rarity]})` : archetype.name,
    rarity,
    valueCp,
    atk: archetype.atk + (rarity >= 2 ? 1 : 0),
    def: archetype.def + (rarity >= 3 ? 1 : 0),
    dr: archetype.dr,
    ownerHeroId: null,
    ownerTeamId: null,
    roomId,
  };
  world.items.push(item);
  return item;
}

export function dropLoot(world: World, team: Team, room: Room): void {
  const floor = world.floors.find((f) => f.id === team.floorId);
  const depth = floor?.depth ?? 1;
  const rng = rngFor(world.seed, world.tick, RngDomain.LOOT_ROLL, room.id);

  const lean = world.dungeon.treasuryCp < LEAN_TREASURY_CP;
  const coin = Math.round((30 + 45 * depth) * (0.5 + rng.float()) * (lean ? 0.6 : 1));
  const item = rng.chance(0.45) ? makeItem(world, depth, null) : null;
  const supplies = rng.chance(0.3) ? rng.int(3, 9) : 0;
  if (supplies > 0) team.rations = Math.min(ECON.rationCap, team.rations + supplies);

  const factor = restockCostFactor(
    world.dungeon.treasuryCp +
      world.teams.reduce((n, t) => n + t.goldCp + t.carriedCp, 0) +
      world.heroes.reduce((n, h) => n + h.goldCp, 0),
  );
  const funded = Math.min(world.dungeon.treasuryCp, Math.round(coin * factor * (lean ? 0.5 : 1)));
  world.dungeon.treasuryCp -= funded;
  if (funded < coin) world.dungeon.mintedCp += coin - funded;
  else world.dungeon.sinkCp += funded - coin;

  const withheld = Math.min(coin, Math.floor((coin * world.dungeon.tollBp * (lean ? 2 : 1)) / 10000));
  world.dungeon.treasuryCp += withheld;
  world.dungeon.corpseYieldCp += withheld;
  team.carriedCp += coin - withheld;
  room.lootCp = 0;
  const total = coin + (item?.valueCp ?? 0);

  if (item) {
    item.ownerTeamId = team.id;
    const bearers = livingRoster(world, team).sort((a, b) => bearerRank(a) - bearerRank(b) || a.id - b.id);
    const bearer = bearers[0];
    if (bearer) {
      item.ownerHeroId = bearer.id;
      bearer.items.push(item.id);
    }
  }

  team.renownMilli += Math.round(12 * Math.log10(1 + total / 100) * 1000);

  emit(world, {
    type: 'LOOT_FOUND',
    teamId: team.id,
    floorId: team.floorId,
    roomId: room.id,
    payload: { coin, item: item?.name ?? '', valueCp: total, room: room.name, rations: supplies },
  });
}
