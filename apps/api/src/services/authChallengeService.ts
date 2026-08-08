import { createHash, randomBytes } from "node:crypto";
import type { AuthUser } from "@nodebeacon/shared";

export type LoginChallengeMethod = "password" | "github";

export interface LoginChallenge {
  user: AuthUser;
  method: LoginChallengeMethod;
  expiresAt: number;
  attempts: number;
}

export interface AuthChallengeService {
  create(user: AuthUser, method: LoginChallengeMethod): string;
  resolve(token: string): LoginChallenge | null;
  recordFailure(token: string): { remaining: number; expired: boolean };
  consume(token: string): void;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function digest(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function createAuthChallengeService(): AuthChallengeService {
  const challenges = new Map<string, LoginChallenge>();

  const prune = () => {
    const now = Date.now();
    for (const [key, challenge] of challenges) {
      if (challenge.expiresAt <= now) challenges.delete(key);
    }
  };

  return {
    create(user, method): string {
      prune();
      const token = randomBytes(32).toString("base64url");
      challenges.set(digest(token), {
        user,
        method,
        expiresAt: Date.now() + CHALLENGE_TTL_MS,
        attempts: 0
      });
      return token;
    },

    resolve(token): LoginChallenge | null {
      prune();
      const challenge = challenges.get(digest(token));
      if (!challenge || challenge.expiresAt <= Date.now()) return null;
      return challenge;
    },

    recordFailure(token) {
      const key = digest(token);
      const challenge = challenges.get(key);
      if (!challenge || challenge.expiresAt <= Date.now()) {
        challenges.delete(key);
        return { remaining: 0, expired: true };
      }
      challenge.attempts += 1;
      const remaining = Math.max(0, MAX_ATTEMPTS - challenge.attempts);
      if (remaining === 0) challenges.delete(key);
      return { remaining, expired: remaining === 0 };
    },

    consume(token): void {
      challenges.delete(digest(token));
    }
  };
}

export const AUTH_CHALLENGE_COOKIE = "nb_login_challenge";
export const AUTH_CHALLENGE_TTL_SECONDS = CHALLENGE_TTL_MS / 1000;
