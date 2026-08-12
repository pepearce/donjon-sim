import type { Db } from './open.js';

export interface RepairReport {
  orphanHeroes: number;
  orphanItems: number;
  orphanMonsters: number;
  staleTavern: number;
  eventsAheadOfWorld: number;
  integrity: string;
  clean: boolean;
}

export function repair(db: Db): RepairReport {
  const worldRow = db.prepare('SELECT tick, next_event_id FROM world WHERE id = 1').get() as
    | { tick: number; next_event_id: number }
    | undefined;

  const integrityRows = db.pragma('integrity_check') as Array<{ integrity_check: string }>;
  const integrity = integrityRows[0]?.integrity_check ?? 'unknown';

  const orphanHeroes = db
    .prepare('UPDATE heroes SET team_id = NULL WHERE team_id IS NOT NULL AND team_id NOT IN (SELECT id FROM teams)')
    .run().changes;

  const orphanItems = db
    .prepare(
      'UPDATE items SET owner_hero_id = NULL WHERE owner_hero_id IS NOT NULL AND owner_hero_id NOT IN (SELECT id FROM heroes)',
    )
    .run().changes;

  const orphanMonsters = db
    .prepare('DELETE FROM monsters WHERE room_id NOT IN (SELECT id FROM rooms)')
    .run().changes;

  const staleTavern = db
    .prepare(
      "DELETE FROM tavern WHERE hero_id NOT IN (SELECT id FROM heroes WHERE state != 'dead' AND team_id IS NULL)",
    )
    .run().changes;

  let eventsAheadOfWorld = 0;
  if (worldRow) {
    eventsAheadOfWorld = db.prepare('DELETE FROM events WHERE tick > ?').run(worldRow.tick).changes;
    const maxId = (db.prepare('SELECT max(id) as m FROM events').get() as { m: number | null }).m ?? 0;
    if (maxId >= worldRow.next_event_id) {
      db.prepare('UPDATE world SET next_event_id = ? WHERE id = 1').run(maxId + 1);
    }
  }

  const clean =
    orphanHeroes === 0 &&
    orphanItems === 0 &&
    orphanMonsters === 0 &&
    staleTavern === 0 &&
    eventsAheadOfWorld === 0 &&
    integrity === 'ok';

  return { orphanHeroes, orphanItems, orphanMonsters, staleTavern, eventsAheadOfWorld, integrity, clean };
}
