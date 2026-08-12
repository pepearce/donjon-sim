import Database from 'better-sqlite3';
import type { Database as Db } from 'better-sqlite3';

export type { Db };

export interface OpenOptions {
  path: string;
  readonly?: boolean;
}

export function openDb(options: OpenOptions): Db {
  const db = new Database(options.path, { readonly: options.readonly ?? false });

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('foreign_keys = ON');
  db.pragma('auto_vacuum = INCREMENTAL');
  db.pragma('busy_timeout = 50');
  db.pragma('temp_store = MEMORY');

  const version = db.prepare('select sqlite_version() as v').get() as { v: string };
  const [major = '0', minor = '0'] = version.v.split('.');
  const numeric = Number(major) * 100 + Number(minor);
  if (numeric < 337) {
    throw new Error(`sqlite >= 3.37 required for STRICT tables, found ${version.v}`);
  }

  return db;
}
