import { createHash, randomBytes } from "node:crypto";
import type { AdminSession, AuthUser } from "@nodebeacon/shared";
import type { SqliteDatabase } from "./database.js";

interface SessionRow {
  id: string;
  user_id: string;
  created_at: number;
  expires_at: number;
  revoked_at: number | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface SessionService {
  create(user: AuthUser, ttlSeconds: number, metadata?: SessionMetadata): string;
  resolve(sessionToken: string): { id: string; userId: string } | null;
  revoke(sessionId: string, userId?: string): boolean;
  listActive(userId: string, currentSessionId?: string): AdminSession[];
}

export function createSessionService(db: SqliteDatabase): SessionService {
  const insert = db.prepare(`
    INSERT INTO sessions(id, user_id, created_at, expires_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const resolve = db.prepare(`
    SELECT id, user_id FROM sessions
    WHERE id = ? AND revoked_at IS NULL AND expires_at > ?
  `);
  const revokeAny = db.prepare(`
    UPDATE sessions SET revoked_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `);
  const revokeForUser = db.prepare(`
    UPDATE sessions SET revoked_at = ?
    WHERE id = ? AND user_id = ? AND revoked_at IS NULL
  `);
  const list = db.prepare(`
    SELECT id, user_id, created_at, expires_at, revoked_at, ip_address, user_agent
    FROM sessions
    WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
    ORDER BY created_at DESC
  `);
  const cleanup = db.prepare(`
    DELETE FROM sessions
    WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)
  `);

  return {
    create(user, ttlSeconds, metadata): string {
      const now = Date.now();
      // Retain recently revoked sessions briefly for operational debugging,
      // while bounding a long-lived process's session table.
      cleanup.run(now, now - 30 * 24 * 60 * 60 * 1000);
      const token = randomBytes(32).toString("base64url");
      // Store only a one-way digest. Session management APIs may safely expose
      // this id without turning an httpOnly cookie into a reusable credential.
      const id = createHash("sha256").update(token).digest("base64url");
      insert.run(
        id,
        user.id,
        now,
        now + ttlSeconds * 1000,
        metadata?.ipAddress ?? null,
        metadata?.userAgent ?? null
      );
      return token;
    },

    resolve(sessionToken): { id: string; userId: string } | null {
      const id = createHash("sha256").update(sessionToken).digest("base64url");
      const row = resolve.get(id, Date.now()) as { id: string; user_id: string } | undefined;
      return row ? { id: row.id, userId: row.user_id } : null;
    },

    revoke(sessionId, userId): boolean {
      const result = userId
        ? revokeForUser.run(Date.now(), sessionId, userId)
        : revokeAny.run(Date.now(), sessionId);
      return result.changes > 0;
    },

    listActive(userId, currentSessionId): AdminSession[] {
      return (list.all(userId, Date.now()) as SessionRow[]).map((row) => ({
        id: row.id,
        userId: row.user_id,
        createdAt: new Date(row.created_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
        ipAddress: row.ip_address ?? undefined,
        userAgent: row.user_agent ?? undefined,
        current: row.id === currentSessionId
      }));
    }
  };
}
