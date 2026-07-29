import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;

export const CURRENT_SCHEMA_VERSION = 5;

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

function migrateToV3(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner', 'viewer')),
      password_hash TEXT,
      github_login TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX users_email_idx ON users(email COLLATE NOCASE);

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE auth_factors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('totp')),
      secret_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, type),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE recovery_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE theme_presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      tokens_json TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    PRAGMA user_version = 3;
  `);
}

function migrateToV4(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE notification_channels (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('telegram','smtp','webhook')),
      config_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE alert_rules (
      id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('offline','load')), name TEXT NOT NULL, node_id TEXT,
      config_json TEXT NOT NULL, channel_ids_json TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      reconcile_status TEXT NOT NULL DEFAULT 'pending', reconcile_error TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE traffic_reports (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, period TEXT NOT NULL CHECK(period IN ('daily','weekly','monthly')),
      time TEXT NOT NULL, timezone TEXT NOT NULL, node_ids_json TEXT NOT NULL, channel_ids_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE notification_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT, idempotency_key TEXT NOT NULL UNIQUE, channel_id TEXT NOT NULL,
      event_type TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL, last_error TEXT, sent_at INTEGER, created_at INTEGER NOT NULL
    );
    PRAGMA user_version = 4;
  `);
}

function migrateToV5(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE latency_tasks (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, protocol TEXT NOT NULL CHECK(protocol IN ('http','tcp','icmp')),
      target TEXT NOT NULL, interval_seconds INTEGER NOT NULL DEFAULT 60, enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE remote_targets (
      id TEXT PRIMARY KEY, node_id TEXT NOT NULL UNIQUE, hostname TEXT NOT NULL, port INTEGER NOT NULL DEFAULT 22,
      enabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE remote_runs (
      id TEXT PRIMARY KEY, target_id TEXT NOT NULL, task_id TEXT NOT NULL, status TEXT NOT NULL,
      exit_code INTEGER, summary TEXT, started_at INTEGER NOT NULL, finished_at INTEGER, actor TEXT NOT NULL
    );
    PRAGMA user_version = 5;
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
  if (version < 3) {
    db.transaction(() => migrateToV3(db))();
  }
  if (version < 4) {
    db.transaction(() => migrateToV4(db))();
  }
  if (version < 5) {
    db.transaction(() => migrateToV5(db))();
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
