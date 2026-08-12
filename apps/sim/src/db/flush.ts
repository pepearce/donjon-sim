import type { Statement, Transaction } from 'better-sqlite3';
import type { Db } from './open.js';
import { encodePath } from './codec.js';
import { encodeFog } from '../engine/fog.js';
import type { World } from '../engine/types.js';

export interface FlushStats {
  flushes: number;
  rowsWritten: number;
  eventsWritten: number;
  lastDurationMs: number;
}

export class Flusher {
  private readonly stmts: Record<string, Statement>;
  private readonly txn: Transaction<(world: World, now: number) => void>;

  readonly stats: FlushStats = { flushes: 0, rowsWritten: 0, eventsWritten: 0, lastDurationMs: 0 };

  constructor(private readonly db: Db) {
    this.stmts = {
      team: db.prepare(`
        INSERT INTO teams (id, name, motto, color_index, monogram, state, floor_id, room_idx,
          target_room, tile_x, tile_y, path_pos, path, morale, gold_cp, carried_cp, rations,
          greed_milli, renown_milli, peak_renown_milli, rank, deepest_floor, last_action,
          commit_until_tick, rest_until_tick, formed_tick, disbanded_tick, explored, explored_tiles,
          history, standing)
        VALUES (@id, @name, @motto, @colorIndex, @monogram, @state, @floorId, @roomIdx,
          @targetRoom, @tileX, @tileY, @pathPos, @path, @morale, @goldCp, @carriedCp, @rations,
          @greedMilli, @renownMilli, @peakRenownMilli, @rank, @deepestFloor, @lastAction,
          @commitUntilTick, @restUntilTick, @formedTick, @disbandedTick, @explored, @exploredTiles,
          @history, @standing)
        ON CONFLICT(id) DO UPDATE SET
          state = excluded.state, floor_id = excluded.floor_id, room_idx = excluded.room_idx,
          target_room = excluded.target_room, tile_x = excluded.tile_x, tile_y = excluded.tile_y,
          path_pos = excluded.path_pos, path = excluded.path, morale = excluded.morale,
          gold_cp = excluded.gold_cp, carried_cp = excluded.carried_cp, rations = excluded.rations,
          renown_milli = excluded.renown_milli, peak_renown_milli = excluded.peak_renown_milli,
          rank = excluded.rank, deepest_floor = excluded.deepest_floor,
          last_action = excluded.last_action, commit_until_tick = excluded.commit_until_tick,
          rest_until_tick = excluded.rest_until_tick, disbanded_tick = excluded.disbanded_tick,
          explored = excluded.explored, explored_tiles = excluded.explored_tiles,
          history = excluded.history, standing = excluded.standing
      `),
      hero: db.prepare(`
        INSERT INTO heroes (id, name, species, class_name, primary_stat, team_id, level, xp, hp,
          hp_max, str, agi, wil, state, bleed_out_tick, kills, scarred, born_tick, died_tick,
          died_wall_ms, gold_cp, traits, epithet, nemesis_name, nemesis_downs, relations)
        VALUES (@id, @name, @species, @className, @primary, @teamId, @level, @xp, @hp,
          @hpMax, @str, @agi, @wil, @state, @bleedOutTick, @kills, @scarred, @bornTick, @diedTick,
          @diedWallMs, @goldCp, @traits, @epithet, @nemesisName, @nemesisDowns, @relations)
        ON CONFLICT(id) DO UPDATE SET
          team_id = excluded.team_id, level = excluded.level, xp = excluded.xp, hp = excluded.hp,
          hp_max = excluded.hp_max, str = excluded.str, agi = excluded.agi, wil = excluded.wil,
          state = excluded.state, bleed_out_tick = excluded.bleed_out_tick, kills = excluded.kills,
          scarred = excluded.scarred, died_tick = excluded.died_tick,
          died_wall_ms = excluded.died_wall_ms, gold_cp = excluded.gold_cp,
          traits = excluded.traits, epithet = excluded.epithet,
          nemesis_name = excluded.nemesis_name, nemesis_downs = excluded.nemesis_downs,
          relations = excluded.relations
      `),
      room: db.prepare(`
        INSERT INTO rooms (id, floor_id, idx, name, x, y, w, h, cx, cy, state, loot_cp,
          trap_tier, trap_state, restock_due_tick, visits, deaths)
        VALUES (@id, @floorId, @idx, @name, @x, @y, @w, @h, @cx, @cy, @state, @lootCp,
          @trapTier, @trapState, @restockDueTick, @visits, @deaths)
        ON CONFLICT(id) DO UPDATE SET
          state = excluded.state, loot_cp = excluded.loot_cp, trap_tier = excluded.trap_tier,
          trap_state = excluded.trap_state, restock_due_tick = excluded.restock_due_tick,
          visits = excluded.visits, deaths = excluded.deaths
      `),
      floor: db.prepare(`
        INSERT INTO floors (id, depth, name, width, height, room_count, entry_room, stairs_room,
          danger_cr_milli, generated_tick, tiles)
        VALUES (@id, @depth, @name, @width, @height, @roomCount, @entryRoom, @stairsRoom,
          @dangerCrMilli, @generatedTick, @tiles)
        ON CONFLICT(id) DO NOTHING
      `),
      monster: db.prepare(`
        INSERT INTO monsters (id, name, cr_milli, hp, hp_max, atk, def, dr, dmg_sides, dmg_bonus,
          xp, wage_cp_per_day, room_id, floor_id, guardian, alive)
        VALUES (@id, @name, @crMilli, @hp, @hpMax, @atk, @def, @dr, @dmgSides, @dmgBonus,
          @xp, @wage, @roomId, @floorId, @guardian, @alive)
        ON CONFLICT(id) DO UPDATE SET hp = excluded.hp, alive = excluded.alive, room_id = excluded.room_id
      `),
      item: db.prepare(`
        INSERT INTO items (id, name, rarity, value_cp, atk, def, dr, owner_hero_id, owner_team_id, room_id)
        VALUES (@id, @name, @rarity, @valueCp, @atk, @def, @dr, @ownerHeroId, @ownerTeamId, @roomId)
        ON CONFLICT(id) DO UPDATE SET
          owner_hero_id = excluded.owner_hero_id, owner_team_id = excluded.owner_team_id,
          room_id = excluded.room_id
      `),
      deleteItems: db.prepare('DELETE FROM items WHERE id NOT IN (SELECT value FROM json_each(?))'),
      event: db.prepare(`
        INSERT INTO events (id, tick, type, severity, team_id, hero_id, floor_id, room_id, payload)
        VALUES (@id, @tick, @type, @severity, @teamId, @heroId, @floorId, @roomId, @payload)
      `),
      dungeon: db.prepare(`
        INSERT INTO dungeon (id, treasury_cp, loan_cp, austerity, aggression_milli,
          lethality_ema_milli, revenue_ema_cp, fame_milli, notoriety_milli, entry_fee_cp, toll_bp,
          corpse_tax_bp, keeper_mood, heroes_slain, corpse_yield_cp, minted_cp, sink_cp,
          scheme, keeper_act, records)
        VALUES (1, @treasuryCp, @loanCp, @austerity, @aggressionMilli, @lethalityEmaMilli,
          @revenueEmaCp, @fameMilli, @notorietyMilli, @entryFeeCp, @tollBp, @corpseTaxBp,
          @keeperMood, @heroesSlain, @corpseYieldCp, @mintedCp, @sinkCp, @scheme, @keeperAct,
          @records)
        ON CONFLICT(id) DO UPDATE SET
          treasury_cp = excluded.treasury_cp, loan_cp = excluded.loan_cp,
          austerity = excluded.austerity, aggression_milli = excluded.aggression_milli,
          lethality_ema_milli = excluded.lethality_ema_milli, revenue_ema_cp = excluded.revenue_ema_cp,
          fame_milli = excluded.fame_milli, notoriety_milli = excluded.notoriety_milli,
          entry_fee_cp = excluded.entry_fee_cp, toll_bp = excluded.toll_bp,
          corpse_tax_bp = excluded.corpse_tax_bp,
          keeper_mood = excluded.keeper_mood, heroes_slain = excluded.heroes_slain,
          corpse_yield_cp = excluded.corpse_yield_cp, minted_cp = excluded.minted_cp,
          sink_cp = excluded.sink_cp, scheme = excluded.scheme, keeper_act = excluded.keeper_act,
          records = excluded.records
      `),
      clearTavern: db.prepare('DELETE FROM tavern'),
      tavern: db.prepare('INSERT INTO tavern (hero_id) VALUES (?)'),
      clearWakes: db.prepare('DELETE FROM wakes'),
      wake: db.prepare('INSERT INTO wakes (due_tick, kind, entity_id) VALUES (@dueTick, @kind, @entityId)'),
      world: db.prepare(`
        UPDATE world SET tick = @tick, next_event_id = @nextEventId, next_hero_id = @nextHeroId,
          next_team_id = @nextTeamId, next_monster_id = @nextMonsterId, next_item_id = @nextItemId,
          next_scheme_id = @nextSchemeId,
          initial_coin_cp = @initialCoinCp, last_flush_ms = @now, status = 'running'
        WHERE id = 1
      `),
    };

    this.txn = db.transaction((world: World, now: number) => {
      for (const floor of world.floors) {
        this.stmts['floor']?.run({
          id: floor.id,
          depth: floor.depth,
          name: floor.name,
          width: floor.width,
          height: floor.height,
          roomCount: floor.rooms.length,
          entryRoom: floor.entryRoom,
          stairsRoom: floor.stairsRoom,
          dangerCrMilli: Math.round(floor.dangerCr * 1000),
          generatedTick: floor.generatedTick,
          tiles: Buffer.from(floor.tiles),
        });
        for (const room of floor.rooms) {
          this.stmts['room']?.run({
            id: room.id,
            floorId: floor.id,
            idx: room.idx,
            name: room.name,
            x: room.x,
            y: room.y,
            w: room.w,
            h: room.h,
            cx: room.cx,
            cy: room.cy,
            state: room.state,
            lootCp: room.lootCp,
            trapTier: room.trapTier,
            trapState: room.trapState,
            restockDueTick: room.restockDueTick,
            visits: room.visits,
            deaths: room.deaths,
          });
        }
      }

      for (const team of world.teams) {
        this.stmts['team']?.run({
          id: team.id,
          name: team.name,
          motto: team.motto,
          colorIndex: team.colorIndex,
          monogram: team.monogram,
          state: team.state,
          floorId: team.floorId,
          roomIdx: team.roomIdx,
          targetRoom: team.targetRoom,
          tileX: team.tileX,
          tileY: team.tileY,
          pathPos: team.pathPos,
          path: encodePath(team.path),
          morale: Math.round(team.morale),
          goldCp: Math.round(team.goldCp),
          carriedCp: Math.round(team.carriedCp),
          rations: Math.round(team.rations),
          greedMilli: Math.round(team.greed * 1000),
          renownMilli: Math.round(team.renownMilli),
          peakRenownMilli: Math.round(team.peakRenownMilli),
          rank: team.rank,
          deepestFloor: team.deepestFloor,
          lastAction: team.lastAction,
          commitUntilTick: team.commitUntilTick,
          restUntilTick: team.restUntilTick,
          formedTick: team.formedTick,
          disbandedTick: team.disbandedTick,
          explored: JSON.stringify([...team.explored]),
          exploredTiles: JSON.stringify(encodeFog(team)),
          history: JSON.stringify(team.history ?? []),
          standing: Math.round(team.standing ?? 0),
        });
      }

      for (const hero of world.heroes) {
        this.stmts['hero']?.run({
          id: hero.id,
          name: hero.name,
          species: hero.species,
          className: hero.className,
          primary: hero.primary,
          teamId: hero.teamId,
          level: hero.level,
          xp: Math.round(hero.xp),
          hp: Math.round(hero.hp),
          hpMax: Math.round(hero.hpMax),
          str: hero.stats.str,
          agi: hero.stats.agi,
          wil: hero.stats.wil,
          state: hero.state,
          bleedOutTick: hero.bleedOutTick,
          kills: hero.kills,
          scarred: hero.scarred ? 1 : 0,
          bornTick: hero.bornTick,
          diedTick: hero.diedTick,
          diedWallMs: hero.diedWallMs,
          goldCp: Math.round(hero.goldCp),
          traits: JSON.stringify(hero.traits ?? []),
          epithet: hero.epithet ?? '',
          nemesisName: hero.nemesisName ?? '',
          nemesisDowns: Math.round(hero.nemesisDowns ?? 0),
          relations: JSON.stringify(hero.relations ?? []),
        });
      }

      for (const monster of world.monsters) {
        this.stmts['monster']?.run({
          id: monster.id,
          name: monster.name,
          crMilli: Math.round(monster.cr * 1000),
          hp: Math.round(monster.hp),
          hpMax: Math.round(monster.hpMax),
          atk: monster.atk,
          def: monster.def,
          dr: monster.dr,
          dmgSides: monster.dmgSides,
          dmgBonus: monster.dmgBonus,
          xp: monster.xp,
          wage: monster.wageCpPerDay,
          roomId: monster.roomId,
          floorId: monster.floorId,
          guardian: monster.guardian ? 1 : 0,
          alive: monster.alive ? 1 : 0,
        });
      }

      for (const item of world.items) {
        this.stmts['item']?.run({
          id: item.id,
          name: item.name,
          rarity: item.rarity,
          valueCp: Math.round(item.valueCp),
          atk: item.atk,
          def: item.def,
          dr: item.dr,
          ownerHeroId: item.ownerHeroId,
          ownerTeamId: item.ownerTeamId,
          roomId: item.roomId,
        });
      }
      this.stmts['deleteItems']?.run(JSON.stringify(world.items.map((i) => i.id)));

      this.stmts['clearTavern']?.run();
      for (const heroId of world.tavern) this.stmts['tavern']?.run(heroId);

      this.stmts['clearWakes']?.run();
      for (const wake of world.scheduler.toArray()) {
        this.stmts['wake']?.run({ dueTick: wake.dueTick, kind: wake.kind, entityId: wake.entityId });
      }

      const d = world.dungeon;
      this.stmts['dungeon']?.run({
        treasuryCp: Math.round(d.treasuryCp),
        loanCp: Math.round(d.loanCp),
        austerity: d.austerity ? 1 : 0,
        aggressionMilli: Math.round(d.aggressionMilli),
        lethalityEmaMilli: Math.round(d.lethalityEmaMilli),
        revenueEmaCp: Math.round(d.revenueEmaCp),
        fameMilli: Math.round(d.fameMilli),
        notorietyMilli: Math.round(d.notorietyMilli),
        entryFeeCp: Math.round(d.entryFeeCp),
        tollBp: Math.round(d.tollBp),
        corpseTaxBp: Math.round(d.corpseTaxBp),
        keeperMood: d.keeperMood,
        heroesSlain: d.heroesSlain,
        corpseYieldCp: Math.round(d.corpseYieldCp),
        mintedCp: Math.round(d.mintedCp),
        sinkCp: Math.round(d.sinkCp),
        scheme: JSON.stringify(d.scheme ?? null),
        keeperAct: JSON.stringify(d.keeperAct ?? {}),
        records: JSON.stringify(d.records ?? []),
      });

      for (const event of world.pendingEvents) {
        this.stmts['event']?.run({
          id: event.id,
          tick: event.tick,
          type: event.type,
          severity: event.severity,
          teamId: event.teamId,
          heroId: event.heroId,
          floorId: event.floorId,
          roomId: event.roomId,
          payload: JSON.stringify(event.payload),
        });
      }

      this.stmts['world']?.run({
        tick: world.tick,
        nextEventId: world.nextEventId,
        nextHeroId: world.nextHeroId,
        nextTeamId: world.nextTeamId,
        nextMonsterId: world.nextMonsterId,
        nextItemId: world.nextItemId,
        nextSchemeId: world.nextSchemeId ?? 1,
        initialCoinCp: world.initialCoinCp,
        now,
      });
    });
  }

  flush(world: World): void {
    const started = Date.now();
    const eventCount = world.pendingEvents.length;
    this.txn.immediate(world, started);
    world.pendingEvents.length = 0;
    this.stats.flushes += 1;
    this.stats.rowsWritten += world.teams.length + world.heroes.length + world.monsters.length;
    this.stats.eventsWritten += eventCount;
    this.stats.lastDurationMs = Date.now() - started;
  }

  markShutdownClean(world: World): void {
    this.flush(world);
    this.db.prepare("UPDATE world SET status = 'shutdown_clean' WHERE id = 1").run();
  }

  checkpoint(mode: 'PASSIVE' | 'TRUNCATE'): void {
    try {
      this.db.pragma(`wal_checkpoint(${mode})`);
    } catch {
      this.stats.lastDurationMs = -1;
    }
  }
}
