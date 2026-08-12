import { randomUUID } from 'node:crypto';
import type { EventType, Severity, SimEvent } from '@donjon/shared';
import type { Db } from './open.js';
import { decodePath } from './codec.js';
import { decodeFog } from '../engine/fog.js';
import { newWorld } from '../engine/setup.js';
import { generateFloor } from '../gen/floorgen.js';
import type {
  Hero,
  Item,
  KeeperActState,
  KeeperScheme,
  Monster,
  RecordEntry,
  Stats,
  Team,
  TeamState,
  World,
} from '../engine/types.js';
import type { WakeKind } from '../engine/scheduler.js';

export const SIM_VERSION = '0.5.0';

export interface BootReport {
  fresh: boolean;
  unclean: boolean;
  tick: number;
  dormancyMs: number;
  bootCount: number;
  uncleanBoots: number;
  eventsHydrated: number;
  floorsLoaded: number;
}

interface WorldRow {
  seed: number;
  tick: number;
  next_event_id: number;
  next_hero_id: number;
  next_team_id: number;
  next_monster_id: number;
  next_item_id: number;
  initial_coin_cp: number;
  next_scheme_id: number;
  last_flush_ms: number;
  dormancy_ms: number;
  status: string;
  boot_count: number;
  unclean_boots: number;
}

function parseArray<T>(raw: unknown): T[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseObject<T>(raw: unknown): T | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

function persistGenesis(db: Db, world: World, now: number): void {
  db.prepare(`
    INSERT INTO world (id, seed, lineage_id, tick, next_event_id, next_hero_id, next_team_id,
      next_monster_id, next_item_id, initial_coin_cp, next_scheme_id, last_flush_ms, dormancy_ms,
      status, sim_version, boot_count, unclean_boots)
    VALUES (1, @seed, @lineageId, 0, @nextEventId, @nextHeroId, @nextTeamId, @nextMonsterId,
      @nextItemId, @initialCoinCp, @nextSchemeId, @now, 0, 'running', @simVersion, 1, 0)
  `).run({
    seed: world.seed,
    lineageId: randomUUID(),
    nextEventId: world.nextEventId,
    nextHeroId: world.nextHeroId,
    nextTeamId: world.nextTeamId,
    nextMonsterId: world.nextMonsterId,
    nextItemId: world.nextItemId,
    initialCoinCp: world.initialCoinCp,
    nextSchemeId: world.nextSchemeId ?? 1,
    now,
    simVersion: SIM_VERSION,
  });
}

export function wipeWorld(db: Db): void {
  const wipe = db.transaction(() => {
    for (const table of [
      'events',
      'wakes',
      'tavern',
      'items',
      'monsters',
      'heroes',
      'teams',
      'rooms',
      'floors',
      'dungeon',
      'world',
    ]) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
  });
  wipe();
}

export function boot(db: Db, seed: number): { world: World; report: BootReport } {
  const now = Date.now();
  const row = db.prepare('SELECT * FROM world WHERE id = 1').get() as WorldRow | undefined;

  if (!row) {
    const world = newWorld(seed);
    persistGenesis(db, world, now);
    return {
      world,
      report: {
        fresh: true,
        unclean: false,
        tick: 0,
        dormancyMs: 0,
        bootCount: 1,
        uncleanBoots: 0,
        eventsHydrated: 0,
        floorsLoaded: world.floors.length,
      },
    };
  }

  const world = newWorld(row.seed);
  world.tick = row.tick;
  world.nextEventId = row.next_event_id;
  world.nextHeroId = row.next_hero_id;
  world.nextTeamId = row.next_team_id;
  world.nextMonsterId = row.next_monster_id;
  world.nextItemId = row.next_item_id;
  world.nextSchemeId = row.next_scheme_id ?? 1;
  world.initialCoinCp = row.initial_coin_cp;
  world.pendingEvents.length = 0;

  const floorRows = db.prepare('SELECT id, depth, generated_tick FROM floors ORDER BY depth').all() as Array<{
    id: number;
    depth: number;
    generated_tick: number;
  }>;
  if (floorRows.length > 0) {
    world.floors = floorRows.map((f) => generateFloor(row.seed, f.depth, f.generated_tick));
  }

  const roomRows = db.prepare('SELECT * FROM rooms').all() as Array<Record<string, number | string>>;
  for (const r of roomRows) {
    const floor = world.floors.find((f) => f.id === Number(r['floor_id']));
    const room = floor?.rooms[Number(r['idx'])];
    if (!room) continue;
    room.state = String(r['state']) as typeof room.state;
    room.lootCp = Number(r['loot_cp']);
    room.trapTier = Number(r['trap_tier']);
    room.trapState = String(r['trap_state']) as typeof room.trapState;
    room.restockDueTick = Number(r['restock_due_tick']);
    room.visits = Number(r['visits']);
    room.deaths = Number(r['deaths']);
  }

  const teamRows = db.prepare('SELECT * FROM teams ORDER BY id').all() as Array<Record<string, never>>;
  if (teamRows.length > 0) {
    world.teams = teamRows.map((t) => {
      const row2 = t as unknown as Record<string, number | string | Buffer | null>;
      const team: Team = {
        id: Number(row2['id']),
        name: String(row2['name']),
        motto: String(row2['motto']),
        colorIndex: Number(row2['color_index']),
        monogram: String(row2['monogram']),
        state: String(row2['state']) as TeamState,
        floorId: Number(row2['floor_id']),
        roomIdx: Number(row2['room_idx']),
        targetRoom: Number(row2['target_room']),
        tileX: Number(row2['tile_x']),
        tileY: Number(row2['tile_y']),
        path: decodePath(row2['path'] as Buffer),
        pathPos: Number(row2['path_pos']),
        roster: [],
        morale: Number(row2['morale']),
        goldCp: Number(row2['gold_cp']),
        carriedCp: Number(row2['carried_cp']),
        rations: Number(row2['rations']),
        greed: Number(row2['greed_milli']) / 1000,
        renownMilli: Number(row2['renown_milli']),
        peakRenownMilli: Number(row2['peak_renown_milli']),
        rank: Number(row2['rank']),
        deepestFloor: Number(row2['deepest_floor']),
        lastAction: String(row2['last_action']),
        commitUntilTick: Number(row2['commit_until_tick']),
        restUntilTick: Number(row2['rest_until_tick']),
        formedTick: Number(row2['formed_tick']),
        disbandedTick: row2['disbanded_tick'] === null ? null : Number(row2['disbanded_tick']),
        lastDeepestTick: Number(row2['formed_tick']),
        explored: new Set<string>(JSON.parse(String(row2['explored'] ?? '[]')) as string[]),
        exploredTiles: decodeFog(String(row2['explored_tiles'] ?? '{}')),
        trail: [],
        history: parseArray<{ t: number; k: string; s: string }>(row2['history']),
        standing: Number(row2['standing'] ?? 0),
      };
      return team;
    });

    const heroRows = db.prepare('SELECT * FROM heroes ORDER BY id').all() as Array<Record<string, number | string | null>>;
    world.heroes = heroRows.map((h) => {
      const stats: Stats = { str: Number(h['str']), agi: Number(h['agi']), wil: Number(h['wil']) };
      const hero: Hero = {
        id: Number(h['id']),
        name: String(h['name']),
        species: String(h['species']),
        className: String(h['class_name']),
        primary: String(h['primary_stat']) as keyof Stats,
        teamId: h['team_id'] === null ? null : Number(h['team_id']),
        level: Number(h['level']),
        xp: Number(h['xp']),
        hp: Number(h['hp']),
        hpMax: Number(h['hp_max']),
        stats,
        state: String(h['state']) as Hero['state'],
        bleedOutTick: Number(h['bleed_out_tick']),
        kills: Number(h['kills']),
        scarred: Number(h['scarred']) === 1,
        bornTick: Number(h['born_tick']),
        diedTick: h['died_tick'] === null ? null : Number(h['died_tick']),
        diedWallMs: h['died_wall_ms'] === null ? null : Number(h['died_wall_ms']),
        goldCp: Number(h['gold_cp']),
        items: [],
        traits: parseArray<string>(h['traits']).filter((t) => typeof t === 'string'),
        epithet: String(h['epithet'] ?? ''),
        nemesisName: String(h['nemesis_name'] ?? ''),
        nemesisDowns: Number(h['nemesis_downs'] ?? 0),
        relations: parseArray<{ id: number; v: number }>(h['relations']).sort((a, b) => a.id - b.id),
      };
      return hero;
    });

    for (const hero of world.heroes) {
      const team = world.teams.find((t) => t.id === hero.teamId);
      if (team) team.roster.push(hero.id);
    }

    const monsterRows = db.prepare('SELECT * FROM monsters').all() as Array<Record<string, number | string>>;
    world.monsters = monsterRows.map((m) => {
      const monster: Monster = {
        id: Number(m['id']),
        name: String(m['name']),
        cr: Number(m['cr_milli']) / 1000,
        hp: Number(m['hp']),
        hpMax: Number(m['hp_max']),
        atk: Number(m['atk']),
        def: Number(m['def']),
        dr: Number(m['dr']),
        dmgSides: Number(m['dmg_sides']),
        dmgBonus: Number(m['dmg_bonus']),
        xp: Number(m['xp']),
        wageCpPerDay: Number(m['wage_cp_per_day']),
        roomId: Number(m['room_id']),
        floorId: Number(m['floor_id']),
        guardian: Number(m['guardian']) === 1,
        alive: Number(m['alive']) === 1,
      };
      return monster;
    });

    const itemRows = db.prepare('SELECT * FROM items').all() as Array<Record<string, number | string | null>>;
    world.items = itemRows.map((i) => {
      const item: Item = {
        id: Number(i['id']),
        name: String(i['name']),
        rarity: Number(i['rarity']) as Item['rarity'],
        valueCp: Number(i['value_cp']),
        atk: Number(i['atk']),
        def: Number(i['def']),
        dr: Number(i['dr']),
        ownerHeroId: i['owner_hero_id'] === null ? null : Number(i['owner_hero_id']),
        ownerTeamId: i['owner_team_id'] === null ? null : Number(i['owner_team_id']),
        roomId: i['room_id'] === null ? null : Number(i['room_id']),
      };
      return item;
    });
    for (const item of world.items) {
      if (item.ownerHeroId === null) continue;
      world.heroes.find((h) => h.id === item.ownerHeroId)?.items.push(item.id);
    }

    const tavernRows = db.prepare('SELECT hero_id FROM tavern').all() as Array<{ hero_id: number }>;
    world.tavern = tavernRows.map((t) => t.hero_id);

    const dungeonRow = db.prepare('SELECT * FROM dungeon WHERE id = 1').get() as
      | Record<string, number | string>
      | undefined;
    if (dungeonRow) {
      world.dungeon = {
        treasuryCp: Number(dungeonRow['treasury_cp']),
        loanCp: Number(dungeonRow['loan_cp']),
        austerity: Number(dungeonRow['austerity']) === 1,
        aggressionMilli: Number(dungeonRow['aggression_milli']),
        lethalityEmaMilli: Number(dungeonRow['lethality_ema_milli']),
        revenueEmaCp: Number(dungeonRow['revenue_ema_cp']),
        fameMilli: Number(dungeonRow['fame_milli']),
        notorietyMilli: Number(dungeonRow['notoriety_milli']),
        entryFeeCp: Number(dungeonRow['entry_fee_cp']),
        tollBp: Number(dungeonRow['toll_bp']),
        corpseTaxBp: Number(dungeonRow['corpse_tax_bp']),
        keeperMood: String(dungeonRow['keeper_mood']),
        heroesSlain: Number(dungeonRow['heroes_slain']),
        corpseYieldCp: Number(dungeonRow['corpse_yield_cp']),
        mintedCp: Number(dungeonRow['minted_cp']),
        sinkCp: Number(dungeonRow['sink_cp']),
        scheme: parseObject<KeeperScheme>(dungeonRow['scheme']),
        keeperAct: {
          last: '',
          tick: 0,
          text: '',
          cooldowns: {},
          ...(parseObject<KeeperActState>(dungeonRow['keeper_act']) ?? {}),
        },
        records: parseArray<RecordEntry>(dungeonRow['records']),
        insolventDays: 0,
      };
    }

    const wakeRows = db.prepare('SELECT due_tick, kind, entity_id FROM wakes ORDER BY due_tick, seq').all() as Array<{
      due_tick: number;
      kind: string;
      entity_id: number;
    }>;
    world.scheduler.load(
      wakeRows.map((w, i) => ({
        dueTick: w.due_tick,
        kind: w.kind as WakeKind,
        entityId: w.entity_id,
        seq: i,
      })),
    );
  }

  const tailRows = db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 500').all() as Array<
    Record<string, number | string | null>
  >;
  for (const e of tailRows.reverse()) {
    const event: SimEvent = {
      id: Number(e['id']),
      tick: Number(e['tick']),
      type: String(e['type']) as EventType,
      severity: Number(e['severity']) as Severity,
      teamId: e['team_id'] === null ? null : Number(e['team_id']),
      heroId: e['hero_id'] === null ? null : Number(e['hero_id']),
      floorId: e['floor_id'] === null ? null : Number(e['floor_id']),
      roomId: e['room_id'] === null ? null : Number(e['room_id']),
      payload: JSON.parse(String(e['payload'])) as Record<string, string | number>,
    };
    world.tailRing.push(event);
  }

  const unclean = row.status !== 'shutdown_clean';
  const dormancy = row.dormancy_ms + Math.max(0, now - row.last_flush_ms);

  db.prepare(
    `UPDATE world SET boot_count = boot_count + 1,
                      unclean_boots = unclean_boots + @uncleanDelta,
                      dormancy_ms = @dormancy,
                      status = 'running',
                      sim_version = @simVersion
     WHERE id = 1`,
  ).run({ uncleanDelta: unclean ? 1 : 0, dormancy, simVersion: SIM_VERSION });

  return {
    world,
    report: {
      fresh: false,
      unclean,
      tick: world.tick,
      dormancyMs: dormancy,
      bootCount: row.boot_count + 1,
      uncleanBoots: row.unclean_boots + (unclean ? 1 : 0),
      eventsHydrated: tailRows.length,
      floorsLoaded: world.floors.length,
    },
  };
}
