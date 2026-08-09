import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiEnv } from "../src/config/env.js";
import { openDatabase } from "../src/services/database.js";
import { decryptSecret, encryptSecret, migrateEncryptedSecrets } from "../src/services/secretService.js";

const legacyEnv = { cookieSecret: "legacy-cookie-secret" } as ApiEnv;
const rotatedEnv = { cookieSecret: legacyEnv.cookieSecret, settingsEncryptionKey: "separate-settings-key" } as ApiEnv;

describe("encrypted settings key migration", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("rewrites legacy TOTP and notification ciphertext with the independent key", async () => {
    dir = await mkdtemp(join(tmpdir(), "nodebeacon-secret-"));
    const db = openDatabase(join(dir, "state.db"));
    const now = Date.now();
    db.prepare("INSERT INTO users(id,email,role,created_at,updated_at) VALUES ('owner','owner@test.dev','owner',?,?)").run(now, now);
    const legacyTotp = encryptSecret(legacyEnv, "totp-secret");
    const legacyNotification = encryptSecret(legacyEnv, JSON.stringify({ botToken: "token" }));
    db.prepare("INSERT INTO auth_factors(user_id,type,secret_json,enabled,created_at,updated_at) VALUES ('owner','totp',?,1,?,?)")
      .run(legacyTotp, now, now);
    db.prepare("INSERT INTO notification_channels(id,name,type,config_json,enabled,created_at,updated_at) VALUES ('channel-1','Alerts','telegram',?,1,?,?)")
      .run(legacyNotification, now, now);

    expect(migrateEncryptedSecrets(rotatedEnv, db)).toBe(2);
    const migratedTotp = db.prepare("SELECT secret_json FROM auth_factors WHERE user_id = 'owner'").get() as { secret_json: string };
    const migratedNotification = db.prepare("SELECT config_json FROM notification_channels WHERE id = 'channel-1'").get() as { config_json: string };
    expect(decryptSecret(rotatedEnv, migratedTotp.secret_json)).toBe("totp-secret");
    expect(decryptSecret(rotatedEnv, migratedNotification.config_json)).toBe(JSON.stringify({ botToken: "token" }));
    expect(decryptSecret({ cookieSecret: "wrong", settingsEncryptionKey: rotatedEnv.settingsEncryptionKey } as ApiEnv, migratedTotp.secret_json)).toBe("totp-secret");
    db.close();
  });

  it("fails closed when a persisted secret matches neither key", async () => {
    dir = await mkdtemp(join(tmpdir(), "nodebeacon-secret-"));
    const db = openDatabase(join(dir, "state.db"));
    const now = Date.now();
    db.prepare("INSERT INTO users(id,email,role,created_at,updated_at) VALUES ('owner','owner@test.dev','owner',?,?)").run(now, now);
    db.prepare("INSERT INTO auth_factors(user_id,type,secret_json,enabled,created_at,updated_at) VALUES ('owner','totp',?,1,?,?)")
      .run(encryptSecret({ cookieSecret: "unrelated" } as ApiEnv, "totp-secret"), now, now);
    expect(() => migrateEncryptedSecrets(rotatedEnv, db)).toThrow(/Unable to decrypt auth_factors/);
    db.close();
  });
});
