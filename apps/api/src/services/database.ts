import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;

const CURRENT_SCHEMA_VERSION = 2;

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

function migrateToV2(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      alert_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('firing', 'resolved')),
      started_at INTEGER NOT NULL,
      resolved_at INTEGER,
      updated_at INTEGER NOT NULL,
      severity TEXT,
      node_id TEXT,
      summary TEXT,
      description TEXT,
      labels_json TEXT NOT NULL,
      annotations_json TEXT NOT NULL,
      generator_url TEXT,
      UNIQUE(fingerprint, started_at)
    );
    CREATE INDEX incidents_started_at_idx ON incidents(started_at DESC);
    CREATE INDEX incidents_node_started_idx ON incidents(node_id, started_at DESC);
    CREATE INDEX incidents_status_idx ON incidents(status, updated_at DESC);

    PRAGMA user_version = 2;
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
  if (version < 2) {
    db.transaction(() => migrateToV2(db))();
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
