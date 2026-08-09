import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { ApiEnv } from "../config/env.js";
import type { SqliteDatabase } from "./database.js";

function keyForSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function decryptWithSecret(secret: string, value: string): string | null {
  try {
    const [ivText, tagText, cipherText] = value.split(".");
    if (!ivText || !tagText || !cipherText) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyForSecret(secret), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(cipherText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function keyFor(env: ApiEnv): Buffer {
  return keyForSecret(env.settingsEncryptionKey || env.cookieSecret);
}

export function encryptSecret(env: ApiEnv, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(env), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSecret(env: ApiEnv, value: string): string | null {
  const current = decryptWithSecret(env.settingsEncryptionKey || env.cookieSecret, value);
  if (current !== null) return current;
  // Keep the legacy fallback during the one-release migration window. Once
  // every row has been rewritten, rotating COOKIE_SECRET cannot affect data.
  return env.settingsEncryptionKey ? decryptWithSecret(env.cookieSecret, value) : null;
}

/**
 * Re-encrypt rows written before SETTINGS_ENCRYPTION_KEY existed. This runs
 * before the app becomes ready, so a partially migrated database is never
 * served. The legacy fallback above is retained for rollback and for rows
 * created by an older pod during a short Recreate rollout.
 */
export function migrateEncryptedSecrets(env: ApiEnv, db: SqliteDatabase): number {
  const settingsKey = env.settingsEncryptionKey;
  if (!settingsKey) return 0;

  const rows = [
    { table: "auth_factors", column: "secret_json" },
    { table: "notification_channels", column: "config_json" }
  ] as const;
  let migrated = 0;

  db.transaction(() => {
    for (const { table, column } of rows) {
      const records = db.prepare(`SELECT rowid AS row_id, ${column} AS encrypted FROM ${table}`).all() as Array<{ row_id: number; encrypted: string }>;
      const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE rowid = ?`);
      for (const record of records) {
        if (decryptWithSecret(settingsKey, record.encrypted) !== null) continue;
        const plaintext = decryptWithSecret(env.cookieSecret, record.encrypted);
        if (plaintext === null) {
          throw new Error(`Unable to decrypt ${table}.${column} row ${record.row_id} with either the configured settings or legacy key.`);
        }
        update.run(encryptSecret(env, plaintext), record.row_id);
        migrated += 1;
      }
    }
  })();

  return migrated;
}
