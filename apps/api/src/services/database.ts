import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;

const CURRENT_SCHEMA_VERSION = 1;

function migrateToV1(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      ip_address TEXT,
      user_agent TEXT
    );
    CREATE INDEX sessions_active_user_idx
      ON sessions(user_id, revoked_at, expires_at);

    CREATE TABLE audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_id TEXT,
      payload_json TEXT
    );
    CREATE INDEX audit_events_ts_idx ON audit_events(ts DESC);

    PRAGMA user_version = 1;
  `);
}

export function migrateDatabase(db: SqliteDatabase): void {
  const version = db.pragma("user_version", { simple: true }) as number;
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Database schema version ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}.`);
  }

  if (version < 1) {
    db.transaction(() => migrateToV1(db))();
  }
}

/** Opens the single process-local SQLite connection and applies migrations. */
export function openDatabase(path: string): SqliteDatabase {
  if (path !== ":memory:") {
    mkdirSync(dirname(resolve(path)), { recursive: true });
  }

  const db = new Database(path);
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  // WAL keeps reads non-blocking during the short session/audit writes.
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  migrateDatabase(db);
  return db;
}
