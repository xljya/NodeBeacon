import { hash, verify } from "@node-rs/argon2";
import type { AuthUser } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import type { SqliteDatabase } from "./database.js";
import { decryptSecret } from "./secretService.js";
import { recoveryCodeHash, verifyTotpCode } from "./totpService.js";

const OWNER_ID = "owner";

interface UserRow {
  id: string;
  email: string;
  role: "owner" | "viewer";
  password_hash: string | null;
  github_login: string | null;
}

export interface AuthService {
  readonly passwordLoginEnabled: boolean;
  readonly githubLoginEnabled: boolean;
  readonly ownerConfigured: boolean;
  readonly totpEnabled: boolean;
  initialize(): Promise<void>;
  verifyCredentials(email: string, password: string): Promise<AuthUser | null>;
  changePassword(email: string, currentPassword: string, nextPassword: string): Promise<boolean>;
  resolveGithubOwner(login: string, githubEmail?: string | null): AuthUser | null;
  getUsers(): AuthUser[];
  getUserById(id: string): AuthUser | null;
  verifySecondFactor(code: string): boolean;
}

function toUser(row: UserRow): AuthUser {
  return { id: row.id, email: row.email, role: row.role };
}

/**
 * Owner authentication is SQLite-backed after the first initialization. The
 * environment variables remain bootstrap inputs so existing deployments can
 * upgrade without a manual database migration command.
 */
export function createAuthService(env: ApiEnv, db?: SqliteDatabase): AuthService {
  let fallbackHash: Promise<string> | null = null;

  const row = (): UserRow | undefined => db?.prepare("SELECT id, email, role, password_hash, github_login FROM users WHERE id = ?").get(OWNER_ID) as UserRow | undefined;
  const githubLoginEnabled = Boolean(env.githubClientId && env.githubClientSecret && env.githubOwnerLogin);

  const service: AuthService = {
    get passwordLoginEnabled(): boolean {
      return Boolean(row()?.password_hash || (env.initialOwnerEmail && env.initialOwnerPassword));
    },
    get githubLoginEnabled(): boolean {
      return githubLoginEnabled;
    },
    get ownerConfigured(): boolean {
      return Boolean(row() || (env.initialOwnerEmail && env.initialOwnerPassword) || githubLoginEnabled);
    },
    get totpEnabled(): boolean {
      const factor = db?.prepare("SELECT enabled FROM auth_factors WHERE user_id = 'owner' AND type = 'totp'").get() as { enabled?: number } | undefined;
      return factor?.enabled === 1;
    },

    async initialize(): Promise<void> {
      if (!db) return;
      const existing = row();
      if (existing) return;
      const email = env.initialOwnerEmail ?? (env.githubOwnerLogin ? `${env.githubOwnerLogin}@github` : undefined);
      if (!email) return;
      const passwordHash = env.initialOwnerPassword ? await hash(env.initialOwnerPassword) : null;
      const now = Date.now();
      db.prepare(`
        INSERT INTO users(id, email, role, password_hash, github_login, created_at, updated_at)
        VALUES (?, ?, 'owner', ?, ?, ?, ?)
      `).run(OWNER_ID, email, passwordHash, env.githubOwnerLogin ?? null, now, now);
    },

    async verifyCredentials(inputEmail, inputPassword): Promise<AuthUser | null> {
      const owner = row();
      const expectedEmail = owner?.email ?? env.initialOwnerEmail;
      const storedHash = owner?.password_hash;
      if (!expectedEmail || !inputPassword || inputEmail.trim().toLowerCase() !== expectedEmail.toLowerCase()) return null;
      let passwordMatches = false;
      try {
        if (storedHash) {
          passwordMatches = await verify(storedHash, inputPassword);
        } else if (env.initialOwnerPassword) {
          fallbackHash ??= hash(env.initialOwnerPassword);
          passwordMatches = await verify(await fallbackHash, inputPassword);
        }
      } catch {
        passwordMatches = false;
      }
      return passwordMatches ? (owner ? toUser(owner) : { id: OWNER_ID, email: expectedEmail, role: "owner" }) : null;
    },

    async changePassword(email, currentPassword, nextPassword): Promise<boolean> {
      if (nextPassword.length < 12 || nextPassword.length > 200) return false;
      const user = await service.verifyCredentials(email, currentPassword);
      if (!user || !db) return false;
      db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .run(await hash(nextPassword), Date.now(), user.id);
      return true;
    },

    verifySecondFactor(code: string): boolean {
      if (!db || !service.totpEnabled) return true;
      const factor = db.prepare("SELECT secret_json FROM auth_factors WHERE user_id = 'owner' AND type = 'totp'").get() as { secret_json?: string } | undefined;
      const secret = factor?.secret_json ? decryptSecret(env, factor.secret_json) : null;
      if (secret && verifyTotpCode(secret, code)) return true;
      const recovery = db.prepare("SELECT id FROM recovery_codes WHERE user_id = 'owner' AND used_at IS NULL AND code_hash = ?").get(recoveryCodeHash(code)) as { id?: number } | undefined;
      if (!recovery?.id) return false;
      db.prepare("UPDATE recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL").run(Date.now(), recovery.id);
      return true;
    },

    resolveGithubOwner(login, githubEmail): AuthUser | null {
      if (!githubLoginEnabled || !env.githubOwnerLogin || login.trim().toLowerCase() !== env.githubOwnerLogin.toLowerCase()) return null;
      const existing = row();
      if (existing) return toUser(existing);
      return { id: OWNER_ID, email: env.initialOwnerEmail ?? githubEmail ?? `${env.githubOwnerLogin}@github`, role: "owner" };
    },

    getUsers(): AuthUser[] {
      if (db) {
        const users = db.prepare("SELECT id, email, role, password_hash, github_login FROM users ORDER BY email COLLATE NOCASE").all() as UserRow[];
        return users.map(toUser);
      }
      if (!service.ownerConfigured) return [];
      return [{ id: OWNER_ID, email: env.initialOwnerEmail ?? `${env.githubOwnerLogin ?? "owner"}@github`, role: "owner" }];
    },

    getUserById(id): AuthUser | null {
      if (db) {
        const user = db.prepare("SELECT id, email, role, password_hash, github_login FROM users WHERE id = ?").get(id) as UserRow | undefined;
        return user ? toUser(user) : null;
      }
      return id === OWNER_ID && service.ownerConfigured
        ? { id: OWNER_ID, email: env.initialOwnerEmail ?? `${env.githubOwnerLogin ?? "owner"}@github`, role: "owner" }
        : null;
    }
  };

  return service;
}
