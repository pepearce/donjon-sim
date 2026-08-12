import type { Db } from './open.js';

export interface Migration {
  version: number;
  name: string;
  up(db: Db): void;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'walking-skeleton',
    up(db) {
      db.exec(`
        CREATE TABLE world (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          seed INTEGER NOT NULL,
          lineage_id TEXT NOT NULL,
          tick INTEGER NOT NULL DEFAULT 0,
          next_event_id INTEGER NOT NULL DEFAULT 1,
          last_flush_ms INTEGER NOT NULL,
          dormancy_ms INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'shutdown_clean')),
          sim_version TEXT NOT NULL,
          boot_count INTEGER NOT NULL DEFAULT 0,
          unclean_boots INTEGER NOT NULL DEFAULT 0
        ) STRICT;

        CREATE TABLE rooms (
          id INTEGER PRIMARY KEY,
          floor_id INTEGER NOT NULL,
          idx INTEGER NOT NULL,
          name TEXT NOT NULL,
          x INTEGER NOT NULL,
          y INTEGER NOT NULL,
          w INTEGER NOT NULL,
          h INTEGER NOT NULL,
          cx INTEGER NOT NULL,
          cy INTEGER NOT NULL,
          visits INTEGER NOT NULL DEFAULT 0,
          UNIQUE (floor_id, idx)
        ) STRICT;

        CREATE TABLE teams (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          motto TEXT NOT NULL,
          color_index INTEGER NOT NULL CHECK (color_index BETWEEN 0 AND 9),
          monogram TEXT NOT NULL,
          state TEXT NOT NULL CHECK (
            state IN ('recruiting', 'delving', 'fighting', 'fleeing', 'resting', 'disbanded')
          ),
          room_idx INTEGER NOT NULL,
          target_room INTEGER NOT NULL,
          tile_x INTEGER NOT NULL,
          tile_y INTEGER NOT NULL,
          path_pos INTEGER NOT NULL DEFAULT 0,
          path BLOB NOT NULL,
          morale INTEGER NOT NULL DEFAULT 70,
          gold_cp INTEGER NOT NULL DEFAULT 0,
          rooms_explored INTEGER NOT NULL DEFAULT 0
        ) STRICT;

        CREATE TABLE heroes (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          species TEXT NOT NULL,
          class_name TEXT NOT NULL,
          team_id INTEGER REFERENCES teams(id),
          level INTEGER NOT NULL DEFAULT 1,
          hp INTEGER NOT NULL,
          hp_max INTEGER NOT NULL,
          alive INTEGER NOT NULL DEFAULT 1 CHECK (alive IN (0, 1))
        ) STRICT;
        CREATE INDEX heroes_team ON heroes (team_id);

        CREATE TABLE events (
          id INTEGER PRIMARY KEY,
          tick INTEGER NOT NULL,
          type TEXT NOT NULL,
          severity INTEGER NOT NULL CHECK (severity BETWEEN 0 AND 3),
          team_id INTEGER,
          hero_id INTEGER,
          floor_id INTEGER,
          room_id INTEGER,
          payload TEXT NOT NULL
        ) STRICT;
        CREATE INDEX events_tick ON events (tick);
        CREATE INDEX events_severity_id ON events (severity, id DESC);
      `);
    },
  },
];

MIGRATIONS.push({
  version: 2,
  name: 'dungeon-full-schema',
  up(db) {
    db.exec(`
      DROP TABLE IF EXISTS events;
      DROP TABLE IF EXISTS heroes;
      DROP TABLE IF EXISTS teams;
      DROP TABLE IF EXISTS rooms;
      DROP TABLE IF EXISTS world;

      CREATE TABLE world (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        seed INTEGER NOT NULL,
        lineage_id TEXT NOT NULL,
        tick INTEGER NOT NULL DEFAULT 0,
        next_event_id INTEGER NOT NULL DEFAULT 1,
        next_hero_id INTEGER NOT NULL DEFAULT 1,
        next_team_id INTEGER NOT NULL DEFAULT 1,
        next_monster_id INTEGER NOT NULL DEFAULT 1,
        next_item_id INTEGER NOT NULL DEFAULT 1,
        initial_coin_cp INTEGER NOT NULL DEFAULT 0,
        last_flush_ms INTEGER NOT NULL,
        dormancy_ms INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'shutdown_clean')),
        sim_version TEXT NOT NULL,
        boot_count INTEGER NOT NULL DEFAULT 0,
        unclean_boots INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      CREATE TABLE dungeon (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        treasury_cp INTEGER NOT NULL,
        loan_cp INTEGER NOT NULL DEFAULT 0,
        austerity INTEGER NOT NULL DEFAULT 0 CHECK (austerity IN (0, 1)),
        aggression_milli INTEGER NOT NULL DEFAULT 1000,
        lethality_ema_milli INTEGER NOT NULL DEFAULT 220,
        revenue_ema_cp INTEGER NOT NULL DEFAULT 0,
        fame_milli INTEGER NOT NULL DEFAULT 0,
        notoriety_milli INTEGER NOT NULL DEFAULT 0,
        entry_fee_cp INTEGER NOT NULL DEFAULT 500,
        toll_bp INTEGER NOT NULL DEFAULT 1500,
        corpse_tax_bp INTEGER NOT NULL DEFAULT 8500,
        keeper_mood TEXT NOT NULL,
        heroes_slain INTEGER NOT NULL DEFAULT 0,
        corpse_yield_cp INTEGER NOT NULL DEFAULT 0,
        minted_cp INTEGER NOT NULL DEFAULT 0,
        sink_cp INTEGER NOT NULL DEFAULT 0
      ) STRICT;

      CREATE TABLE floors (
        id INTEGER PRIMARY KEY,
        depth INTEGER NOT NULL UNIQUE,
        name TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        room_count INTEGER NOT NULL,
        entry_room INTEGER NOT NULL,
        stairs_room INTEGER NOT NULL,
        danger_cr_milli INTEGER NOT NULL,
        generated_tick INTEGER NOT NULL,
        tiles BLOB NOT NULL
      ) STRICT;

      CREATE TABLE rooms (
        id INTEGER PRIMARY KEY,
        floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
        idx INTEGER NOT NULL,
        name TEXT NOT NULL,
        x INTEGER NOT NULL, y INTEGER NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL,
        cx INTEGER NOT NULL, cy INTEGER NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('stocked', 'cleared', 'restocking')),
        loot_cp INTEGER NOT NULL DEFAULT 0,
        trap_tier INTEGER NOT NULL DEFAULT 0,
        trap_state TEXT NOT NULL CHECK (trap_state IN ('none', 'armed', 'sprung', 'disarmed')),
        restock_due_tick INTEGER NOT NULL DEFAULT 0,
        visits INTEGER NOT NULL DEFAULT 0,
        deaths INTEGER NOT NULL DEFAULT 0,
        UNIQUE (floor_id, idx)
      ) STRICT;

      CREATE TABLE teams (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        motto TEXT NOT NULL,
        color_index INTEGER NOT NULL CHECK (color_index BETWEEN 0 AND 9),
        monogram TEXT NOT NULL,
        state TEXT NOT NULL CHECK (
          state IN ('recruiting', 'delving', 'fighting', 'fleeing', 'resting', 'disbanded')
        ),
        floor_id INTEGER NOT NULL,
        room_idx INTEGER NOT NULL,
        target_room INTEGER NOT NULL,
        tile_x INTEGER NOT NULL,
        tile_y INTEGER NOT NULL,
        path_pos INTEGER NOT NULL DEFAULT 0,
        path BLOB NOT NULL,
        morale INTEGER NOT NULL DEFAULT 70,
        gold_cp INTEGER NOT NULL DEFAULT 0,
        carried_cp INTEGER NOT NULL DEFAULT 0,
        rations INTEGER NOT NULL DEFAULT 0,
        greed_milli INTEGER NOT NULL DEFAULT 500,
        renown_milli INTEGER NOT NULL DEFAULT 0,
        peak_renown_milli INTEGER NOT NULL DEFAULT 0,
        rank INTEGER NOT NULL DEFAULT 0,
        deepest_floor INTEGER NOT NULL DEFAULT 1,
        last_action TEXT NOT NULL DEFAULT 'EXPLORE',
        commit_until_tick INTEGER NOT NULL DEFAULT 0,
        rest_until_tick INTEGER NOT NULL DEFAULT 0,
        formed_tick INTEGER NOT NULL,
        disbanded_tick INTEGER
      ) STRICT;
      CREATE INDEX teams_rank ON teams (rank);

      CREATE TABLE heroes (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        species TEXT NOT NULL,
        class_name TEXT NOT NULL,
        primary_stat TEXT NOT NULL,
        team_id INTEGER REFERENCES teams(id),
        level INTEGER NOT NULL DEFAULT 1,
        xp INTEGER NOT NULL DEFAULT 0,
        hp INTEGER NOT NULL,
        hp_max INTEGER NOT NULL,
        str INTEGER NOT NULL, agi INTEGER NOT NULL, wil INTEGER NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('ok', 'downed', 'dead')),
        bleed_out_tick INTEGER NOT NULL DEFAULT 0,
        kills INTEGER NOT NULL DEFAULT 0,
        scarred INTEGER NOT NULL DEFAULT 0 CHECK (scarred IN (0, 1)),
        born_tick INTEGER NOT NULL,
        died_tick INTEGER,
        died_wall_ms INTEGER,
        gold_cp INTEGER NOT NULL DEFAULT 0
      ) STRICT;
      CREATE INDEX heroes_team ON heroes (team_id);
      CREATE INDEX heroes_dead ON heroes (died_tick DESC) WHERE died_tick IS NOT NULL;

      CREATE TABLE monsters (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        cr_milli INTEGER NOT NULL,
        hp INTEGER NOT NULL, hp_max INTEGER NOT NULL,
        atk INTEGER NOT NULL, def INTEGER NOT NULL, dr INTEGER NOT NULL,
        dmg_sides INTEGER NOT NULL, dmg_bonus INTEGER NOT NULL,
        xp INTEGER NOT NULL, wage_cp_per_day INTEGER NOT NULL,
        room_id INTEGER NOT NULL, floor_id INTEGER NOT NULL,
        guardian INTEGER NOT NULL CHECK (guardian IN (0, 1)),
        alive INTEGER NOT NULL CHECK (alive IN (0, 1))
      ) STRICT;
      CREATE INDEX monsters_room ON monsters (room_id) WHERE alive = 1;

      CREATE TABLE items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        rarity INTEGER NOT NULL CHECK (rarity BETWEEN 0 AND 4),
        value_cp INTEGER NOT NULL,
        atk INTEGER NOT NULL, def INTEGER NOT NULL, dr INTEGER NOT NULL,
        owner_hero_id INTEGER, owner_team_id INTEGER, room_id INTEGER
      ) STRICT;
      CREATE INDEX items_owner ON items (owner_hero_id);

      CREATE TABLE tavern (
        hero_id INTEGER PRIMARY KEY REFERENCES heroes(id)
      ) STRICT;

      CREATE TABLE wakes (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        due_tick INTEGER NOT NULL,
        kind TEXT NOT NULL,
        entity_id INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX wakes_due ON wakes (due_tick);

      CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        tick INTEGER NOT NULL,
        type TEXT NOT NULL,
        severity INTEGER NOT NULL CHECK (severity BETWEEN 0 AND 3),
        team_id INTEGER,
        hero_id INTEGER,
        floor_id INTEGER,
        room_id INTEGER,
        payload TEXT NOT NULL
      ) STRICT;
      CREATE INDEX events_tick ON events (tick);
      CREATE INDEX events_severity_id ON events (severity, id DESC);
    `);
  },
});

MIGRATIONS.push({
  version: 3,
  name: 'team-fog-of-war',
  up(db) {
    db.exec("ALTER TABLE teams ADD COLUMN explored TEXT NOT NULL DEFAULT '[]'");
  },
});

MIGRATIONS.push({
  version: 4,
  name: 'team-fog-tiles',
  up(db) {
    db.exec("ALTER TABLE teams ADD COLUMN explored_tiles TEXT NOT NULL DEFAULT '{}'");
  },
});

export interface MigrateReport {
  from: number;
  to: number;
  applied: string[];
}

export function migrate(db: Db): MigrateReport {
  const current = (db.pragma('user_version', { simple: true }) as number) ?? 0;
  const applied: string[] = [];

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
      db.exec('COMMIT');
      applied.push(`${migration.version}:${migration.name}`);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  const target = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
  return { from: current, to: target, applied };
}
