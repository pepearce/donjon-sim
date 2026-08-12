import { emit } from '../emit.js';
import { floorOf, roster } from '../world.js';
import { RATION_CAP, atShop, rationPriceCp } from './economy.js';
import { makeItem } from './loot.js';
import { clamp, type Team, type World } from '../types.js';

const SHOP_ITEM_GOLD_CP = 2500;

export function resupply(world: World, team: Team): void {
  if (!atShop(world, team)) return;
  const floor = floorOf(world, team.floorId);
  const depth = floor?.depth ?? 1;
  const room = floor?.rooms[team.roomIdx];
  const shopName = room?.name ?? 'the stall';
  const price = rationPriceCp(world, depth);
  const bought = Math.max(0, Math.min(RATION_CAP - team.rations, Math.floor(team.goldCp / price)));

  if (bought > 0) {
    const spend = bought * price;
    team.goldCp -= spend;
    world.dungeon.treasuryCp += spend;
    team.rations = clamp(0, RATION_CAP, team.rations + bought);
    team.morale = clamp(0, 100, team.morale + 2);
    emit(world, {
      type: 'SHOP_TRADE',
      teamId: team.id,
      floorId: team.floorId,
      roomId: room?.id ?? null,
      payload: { team: team.name, rations: bought, cp: spend, shop: shopName },
    });
  }

  if (team.goldCp < SHOP_ITEM_GOLD_CP) return;

  const item = makeItem(world, depth + 1, null);
  const cost = Math.min(Math.round(item.valueCp * 1.6), Math.floor(team.goldCp * 0.5));
  team.goldCp -= cost;
  world.dungeon.treasuryCp += cost;
  item.ownerTeamId = team.id;

  const bearer = roster(world, team)
    .filter((h) => h.state === 'ok')
    .sort((a, b) => a.items.length - b.items.length || a.id - b.id)[0];
  if (bearer) {
    item.ownerHeroId = bearer.id;
    bearer.items.push(item.id);
  }

  emit(world, {
    type: 'SHOP_TRADE',
    teamId: team.id,
    floorId: team.floorId,
    roomId: room?.id ?? null,
    payload: { team: team.name, item: item.name, cp: cost, shop: shopName },
  });
}
