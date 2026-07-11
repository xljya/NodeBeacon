import type { AdminAuditEvent } from "@nodebeacon/shared";
import type { SqliteDatabase } from "./database.js";

interface AuditRow {
  id: number;
  ts: number;
  actor: string;
  action: string;
  entity_id: string | null;
  payload_json: string | null;
}

export interface AuditEventInput {
  actor: string;
  action: string;
  entityId?: string;
  payload?: unknown;
}

export interface AuditService {
  record(event: AuditEventInput): void;
  list(limit?: number): AdminAuditEvent[];
  pruneBefore(cutoff: number): number;
}

export function createAuditService(db: SqliteDatabase): AuditService {
  const insert = db.prepare(`
    INSERT INTO audit_events(ts, actor, action, entity_id, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `);
  const list = db.prepare(`
    SELECT id, ts, actor, action, entity_id, payload_json
    FROM audit_events
    ORDER BY ts DESC, id DESC
    LIMIT ?
  `);
  const prune = db.prepare("DELETE FROM audit_events WHERE ts < ?");

  return {
    record(event): void {
      insert.run(
        Date.now(),
        event.actor,
        event.action,
        event.entityId ?? null,
        event.payload === undefined ? null : JSON.stringify(event.payload)
      );
    },

    list(requestedLimit = 100): AdminAuditEvent[] {
      const limit = Math.max(1, Math.min(200, Math.trunc(requestedLimit)));
      return (list.all(limit) as AuditRow[]).map((row) => {
        let payload: unknown;
        if (row.payload_json) {
          try {
            payload = JSON.parse(row.payload_json);
          } catch {
            payload = { unreadable: true };
          }
        }
        return {
          id: row.id,
          timestamp: new Date(row.ts).toISOString(),
          actor: row.actor,
          action: row.action,
          entityId: row.entity_id ?? undefined,
          payload
        };
      });
    },

    pruneBefore(cutoff): number {
      return prune.run(cutoff).changes;
    }
  };
}
