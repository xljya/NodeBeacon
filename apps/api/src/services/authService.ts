import { hash, verify } from "@node-rs/argon2";
import type { AuthUser } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";

const OWNER_ID = "owner";

export interface AuthService {
  passwordLoginEnabled: boolean;
  githubLoginEnabled: boolean;
  /** True when at least one sign-in method can authenticate the owner. */
  ownerConfigured: boolean;
  verifyCredentials(email: string, password: string): Promise<AuthUser | null>;
  /** Returns the owner iff the GitHub login matches the configured owner login. */
  resolveGithubOwner(login: string, githubEmail?: string | null): AuthUser | null;
  getUsers(): AuthUser[];
  getUserById(id: string): AuthUser | null;
}

/**
 * Single-owner auth backed by environment variables (no database this cut).
 * Two ways in, both resolving to the same owner identity (id "owner"):
 *  - password: INITIAL_OWNER_EMAIL + INITIAL_OWNER_PASSWORD (argon2id).
 *  - GitHub OAuth: only the account whose login === GITHUB_OWNER_LOGIN.
 */
export function createAuthService(env: ApiEnv): AuthService {
  const email = env.initialOwnerEmail;
  const password = env.initialOwnerPassword;
  const githubOwnerLogin = env.githubOwnerLogin;

  const passwordLoginEnabled = Boolean(email && password);
  const githubLoginEnabled = Boolean(env.githubClientId && env.githubClientSecret && githubOwnerLogin);

  // Base owner identity when an email is configured; otherwise derived lazily.
  const baseOwner: AuthUser | null = email ? { id: OWNER_ID, email, role: "owner" } : null;

  function ownerIdentity(fallbackEmail?: string | null): AuthUser {
    return {
      id: OWNER_ID,
      email: baseOwner?.email ?? fallbackEmail ?? (githubOwnerLogin ? `${githubOwnerLogin}@github` : "owner"),
      role: "owner"
    };
  }

  let hashPromise: Promise<string> | null = null;
  const ownerPasswordHash = (): Promise<string> => (hashPromise ??= hash(password as string));

  return {
    passwordLoginEnabled,
    githubLoginEnabled,
    ownerConfigured: passwordLoginEnabled || githubLoginEnabled,

    async verifyCredentials(inputEmail, inputPassword): Promise<AuthUser | null> {
      if (!baseOwner || !password) return null;
      const emailMatches = inputEmail.trim().toLowerCase() === baseOwner.email.toLowerCase();
      let passwordMatches = false;
      try {
        passwordMatches = await verify(await ownerPasswordHash(), inputPassword);
      } catch {
        passwordMatches = false;
      }
      return emailMatches && passwordMatches ? baseOwner : null;
    },

    resolveGithubOwner(login, githubEmail): AuthUser | null {
      if (!githubLoginEnabled || !githubOwnerLogin) return null;
      if (login.trim().toLowerCase() !== githubOwnerLogin.toLowerCase()) return null;
      return ownerIdentity(githubEmail);
    },

    getUsers(): AuthUser[] {
      if (!passwordLoginEnabled && !githubLoginEnabled) return [];
      return [ownerIdentity()];
    },

    getUserById(id: string): AuthUser | null {
      if (id !== OWNER_ID) return null;
      if (!passwordLoginEnabled && !githubLoginEnabled) return null;
      return ownerIdentity();
    }
  };
}
