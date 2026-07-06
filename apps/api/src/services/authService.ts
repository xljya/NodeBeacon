import { hash, verify } from "@node-rs/argon2";
import type { AuthUser } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";

const OWNER_ID = "owner";

export interface AuthService {
  /** True when both INITIAL_OWNER_EMAIL and INITIAL_OWNER_PASSWORD are set. */
  ownerConfigured: boolean;
  verifyCredentials(email: string, password: string): Promise<AuthUser | null>;
  getUsers(): AuthUser[];
  getUserById(id: string): AuthUser | null;
}

/**
 * Single-owner auth backed by environment variables. No database in this
 * iteration: the owner is created from INITIAL_OWNER_* and the password is
 * hashed once (argon2id — the @node-rs/argon2 default) so login uses a slow
 * constant-time verify. Multi-user / SQLite persistence is a later step.
 */
export function createAuthService(env: ApiEnv): AuthService {
  const email = env.initialOwnerEmail;
  const password = env.initialOwnerPassword;
  const ownerConfigured = Boolean(email && password);
  const owner: AuthUser | null = email && password
    ? { id: OWNER_ID, email, role: "owner" }
    : null;

  // Hash the configured password lazily and memoize it.
  let hashPromise: Promise<string> | null = null;
  const ownerPasswordHash = (): Promise<string> => {
    if (!hashPromise) {
      hashPromise = hash(password as string);
    }
    return hashPromise;
  };

  return {
    ownerConfigured,

    async verifyCredentials(inputEmail, inputPassword): Promise<AuthUser | null> {
      if (!owner || !password) return null;
      const emailMatches = inputEmail.trim().toLowerCase() === owner.email.toLowerCase();
      let passwordMatches = false;
      try {
        // Always run verify (even on email mismatch) to flatten timing.
        passwordMatches = await verify(await ownerPasswordHash(), inputPassword);
      } catch {
        passwordMatches = false;
      }
      return emailMatches && passwordMatches ? owner : null;
    },

    getUsers(): AuthUser[] {
      return owner ? [owner] : [];
    },

    getUserById(id: string): AuthUser | null {
      return owner && owner.id === id ? owner : null;
    }
  };
}
