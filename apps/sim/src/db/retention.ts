import { DAY_TICKS, HOURS } from '@donjon/shared';
import type { Db } from './open.js';

export const SEVERITY_HORIZON_TICKS: Record<number, number> = {
  0: HOURS(6),
  1: HOURS(48),
  2: DAY_TICKS * 30,
  3: Number.POSITIVE_INFINITY,
};

export const SEV3_HARD_CAP = 400_000;
export const DELETE_BATCH = 5_000;

export interface RetentionReport {
  deletedBySeverity: Record<number, number>;
  deletedOverCap: number;
  remaining: number;
  ranAtTick: number;
}

export class Retention {
  constructor(private readonly db: Db) {}

  run(tick: number): RetentionReport {
    const deletedBySeverity: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

    for (const severity of [0, 1, 2]) {
      const horizon = SEVERITY_HORIZON_TICKS[severity];
      if (horizon === undefined || !Number.isFinite(horizon)) continue;
      const cutoff = tick - horizon;
      if (cutoff <= 0) continue;

      let removed = 0;
      for (;;) {
        const result = this.db
          .prepare(
            `DELETE FROM events WHERE id IN (
               SELECT id FROM events WHERE severity = ? AND tick < ? LIMIT ?
             )`,
          )
          .run(severity, cutoff, DELETE_BATCH);
        removed += result.changes;
        if (result.changes < DELETE_BATCH) break;
      }
      deletedBySeverity[severity] = removed;
    }

    const sev3 = (
      this.db.prepare('SELECT count(*) as n FROM events WHERE severity = 3').get() as { n: number }
    ).n;

    let deletedOverCap = 0;
    if (sev3 > SEV3_HARD_CAP) {
      const excess = sev3 - SEV3_HARD_CAP;
      const result = this.db
        .prepare(
          `DELETE FROM events WHERE id IN (
             SELECT id FROM events WHERE severity = 3 ORDER BY id ASC LIMIT ?
           )`,
        )
        .run(excess);
      deletedOverCap = result.changes;
    }

    const remaining = (this.db.prepare('SELECT count(*) as n FROM events').get() as { n: number }).n;

    return { deletedBySeverity, deletedOverCap, remaining, ranAtTick: tick };
  }

  pruneDeadMonsters(): number {
    return this.db.prepare('DELETE FROM monsters WHERE alive = 0').run().changes;
  }

  vacuumStep(): void {
    try {
      this.db.pragma('incremental_vacuum(200)');
    } catch {
      return;
    }
  }

  dbBytes(): number {
    const pageCount = this.db.pragma('page_count', { simple: true }) as number;
    const pageSize = this.db.pragma('page_size', { simple: true }) as number;
    return pageCount * pageSize;
  }
}
