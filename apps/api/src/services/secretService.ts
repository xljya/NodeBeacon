import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { ApiEnv } from "../config/env.js";

function keyFor(env: ApiEnv): Buffer {
  return createHash("sha256").update(env.settingsEncryptionKey || env.cookieSecret).digest();
}

export function encryptSecret(env: ApiEnv, value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(env), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSecret(env: ApiEnv, value: string): string | null {
  try {
    const [ivText, tagText, cipherText] = value.split(".");
    if (!ivText || !tagText || !cipherText) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFor(env), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(cipherText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
