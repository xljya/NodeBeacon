import type {
  AdminIncident,
  IncidentStatus,
  IncidentSummary
} from "@nodebeacon/shared";
import type { SqliteDatabase } from "./database.js";

export interface IncomingIncidentAlert {
  status: IncidentStatus;
  fingerprint: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt?: string;
  generatorUrl?: string;
}

interface IncidentRow {
  id: number;
  fingerprint: string;
  alert_name: string;
  status: IncidentStatus;
  started_at: number;
  resolved_at: number | null;
  updated_at: number;
  severity: string | null;
  node_id: string | null;
  summary: string | null;
  description: string | null;
  labels_json: string;
  annotations_json: string;
  generator_url: string | null;
}

export interface IncidentService {
  record(alerts: IncomingIncidentAlert[]): number;
  list(limit?: number, nodeId?: string): AdminIncident[];
  listPublic(limit?: number, nodeId?: string): IncidentSummary[];
}

function parseTimestamp(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseRecord(json: string): Record<string, string> {
  try {
    const value = JSON.parse(json) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]))
      : {};
  } catch {
    return {};
  }
}

function toAdminIncident(row: IncidentRow): AdminIncident {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    alertName: row.alert_name,
    status: row.status,
    startedAt: new Date(row.started_at).toISOString(),
    resolvedAt: row.resolved_at === null ? undefined : new Date(row.resolved_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    severity: row.severity ?? undefined,
    nodeId: row.node_id ?? undefined,
    summary: row.summary ?? undefined,
    description: row.description ?? undefined,
    labels: parseRecord(row.labels_json),
    annotations: parseRecord(row.annotations_json),
    generatorUrl: row.generator_url ?? undefined
  };
}

function toPublicIncident(incident: AdminIncident): IncidentSummary {
  const {
    labels: _labels,
    annotations: _annotations,
    generatorUrl: _generatorUrl,
    ...summary
  } = incident;
  return summary;
}

export function createIncidentService(db: SqliteDatabase): IncidentService {
  const upsert = db.prepare(`
    INSERT INTO incidents(
      fingerprint, alert_name, status, started_at, resolved_at, updated_at,
      severity, node_id, summary, description, labels_json, annotations_json, generator_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fingerprint, started_at) DO UPDATE SET
      alert_name = excluded.alert_name,
      status = excluded.status,
      resolved_at = excluded.resolved_at,
      updated_at = excluded.updated_at,
      severity = excluded.severity,
      node_id = excluded.node_id,
      summary = excluded.summary,
      description = excluded.description,
      labels_json = excluded.labels_json,
      annotations_json = excluded.annotations_json,
      generator_url = excluded.generator_url
  `);
  const listAll = db.prepare(`
    SELECT * FROM incidents ORDER BY started_at DESC, id DESC LIMIT ?
  `);
  const listByNode = db.prepare(`
    SELECT * FROM incidents WHERE node_id = ? ORDER BY started_at DESC, id DESC LIMIT ?
  `);

  const recordTransaction = db.transaction((alerts: IncomingIncidentAlert[]) => {
    const now = Date.now();
    for (const alert of alerts) {
      const startedAt = parseTimestamp(alert.startsAt, now);
      const resolvedAt = alert.status === "resolved" ? parseTimestamp(alert.endsAt, now) : null;
      upsert.run(
        alert.fingerprint,
        alert.labels.alertname ?? "UnknownAlert",
        alert.status,
        startedAt,
        resolvedAt,
        now,
        alert.labels.severity ?? null,
        alert.labels.node_id ?? alert.labels.node ?? null,
        alert.annotations.summary ?? null,
        alert.annotations.description ?? null,
        JSON.stringify(alert.labels),
        JSON.stringify(alert.annotations),
        alert.generatorUrl ?? null
      );
    }
  });

  return {
    record(alerts): number {
      recordTransaction(alerts);
      return alerts.length;
    },

    list(limit = 100, nodeId): AdminIncident[] {
      const bounded = Math.max(1, Math.min(200, Math.trunc(limit)));
      const rows = nodeId
        ? listByNode.all(nodeId, bounded) as IncidentRow[]
        : listAll.all(bounded) as IncidentRow[];
      return rows.map(toAdminIncident);
    },

    listPublic(limit = 20, nodeId): IncidentSummary[] {
      return this.list(Math.min(50, limit), nodeId).map(toPublicIncident);
    }
  };
}
