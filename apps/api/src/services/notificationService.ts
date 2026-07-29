import { randomUUID } from "node:crypto";
import tls from "node:tls";
import type { ApiEnv } from "../config/env.js";
import type { SqliteDatabase } from "./database.js";
import { decryptSecret, encryptSecret } from "./secretService.js";

export type NotificationChannelType = "telegram" | "smtp" | "webhook";
export interface NotificationChannel { id: string; name: string; type: NotificationChannelType; enabled: boolean; config: Record<string, unknown>; createdAt: string; updatedAt: string }
export interface AlertRule { id: string; type: "offline" | "load"; name: string; nodeId?: string; config: Record<string, unknown>; channelIds: string[]; enabled: boolean; reconcileStatus: string; reconcileError?: string }

async function sendSmtp(config: Record<string, unknown>, payload: string): Promise<void> {
  const host = String(config.host ?? ""); const port = Number(config.port ?? 465); const username = String(config.username ?? ""); const password = String(config.password ?? ""); const from = String(config.from ?? username); const to = String(config.to ?? "");
  if (!host || !to) throw new Error("SMTP host, from and to are required");
  await new Promise<void>((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: true }); let buffer = ""; let step = 0;
    const fail = (error: Error) => { socket.destroy(); reject(error); };
    const command = (line: string) => socket.write(`${line}\r\n`);
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => { buffer += chunk; if (!buffer.includes("\r\n")) return; const code = Number(buffer.slice(0, 3)); buffer = ""; if (code >= 400) return fail(new Error(`SMTP status ${code}`)); step++; if (step === 1) command("EHLO nodebeacon"); else if (step === 2) { command("AUTH LOGIN"); } else if (step === 3) command(Buffer.from(username).toString("base64")); else if (step === 4) command(Buffer.from(password).toString("base64")); else if (step === 5) command(`MAIL FROM:<${from}>`); else if (step === 6) command(`RCPT TO:<${to}>`); else if (step === 7) { command("DATA"); } else if (step === 8) { socket.write(`From: ${from}\r\nTo: ${to}\r\nSubject: NodeBeacon notification\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${payload.replace(/[\r\n]/g, " ")}\r\n.\r\n`); } else { command("QUIT"); socket.end(); resolve(); } });
    socket.on("error", reject); socket.setTimeout(10_000, () => fail(new Error("SMTP timeout")));
  });
}

interface ChannelRow { id: string; name: string; type: NotificationChannelType; config_json: string; enabled: number; created_at: number; updated_at: number }

function maskConfig(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, /token|password|secret|auth/i.test(key) && value ? "••••••" : value]));
}

export function createNotificationService(db: SqliteDatabase, env: ApiEnv) {
  const listChannels = (): NotificationChannel[] => (db.prepare("SELECT * FROM notification_channels ORDER BY name COLLATE NOCASE").all() as ChannelRow[]).map((row) => ({ id: row.id, name: row.name, type: row.type, enabled: row.enabled === 1, config: maskConfig(JSON.parse(decryptSecret(env, row.config_json) ?? "{}") as Record<string, unknown>), createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() }));
  const getConfig = (id: string): Record<string, unknown> | null => { const row = db.prepare("SELECT config_json FROM notification_channels WHERE id = ?").get(id) as { config_json?: string } | undefined; return row?.config_json ? JSON.parse(decryptSecret(env, row.config_json) ?? "{}") as Record<string, unknown> : null; };
  const saveChannel = (input: { id?: string; name: string; type: NotificationChannelType; config: Record<string, unknown>; enabled?: boolean }): NotificationChannel => {
    if (!input.name.trim() || !["telegram", "smtp", "webhook"].includes(input.type)) throw new Error("Invalid notification channel");
    if (input.type === "webhook") { const url = String(input.config.url ?? ""); const parsed = new URL(url); if (parsed.protocol !== "https:") throw new Error("Webhook must use HTTPS"); if (env.notificationAllowedHosts.length > 0 && !env.notificationAllowedHosts.includes(parsed.hostname.toLowerCase())) throw new Error("Webhook host is not allowed"); }
    const id = input.id ?? `channel-${randomUUID()}`; const now = Date.now(); const existing = db.prepare("SELECT config_json FROM notification_channels WHERE id = ?").get(id) as { config_json?: string } | undefined; const config = { ...(existing?.config_json ? getConfig(id) : {}), ...input.config };
    db.prepare(`INSERT INTO notification_channels(id,name,type,config_json,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,type=excluded.type,config_json=excluded.config_json,enabled=excluded.enabled,updated_at=excluded.updated_at`).run(id, input.name.trim().slice(0, 80), input.type, encryptSecret(env, JSON.stringify(config)), input.enabled === false ? 0 : 1, now, now);
    return listChannels().find((channel) => channel.id === id) as NotificationChannel;
  };
  const deleteChannel = (id: string) => db.prepare("DELETE FROM notification_channels WHERE id = ?").run(id).changes > 0;
  const listRules = (): AlertRule[] => (db.prepare("SELECT * FROM alert_rules ORDER BY created_at DESC").all() as Array<{ id: string; type: "offline" | "load"; name: string; node_id: string | null; config_json: string; channel_ids_json: string; enabled: number; reconcile_status: string; reconcile_error: string | null }>).map((row) => ({ id: row.id, type: row.type, name: row.name, nodeId: row.node_id ?? undefined, config: JSON.parse(row.config_json) as Record<string, unknown>, channelIds: JSON.parse(row.channel_ids_json) as string[], enabled: row.enabled === 1, reconcileStatus: row.reconcile_status, reconcileError: row.reconcile_error ?? undefined }));
  const saveRule = (input: { id?: string; type: "offline" | "load"; name: string; nodeId?: string; config?: Record<string, unknown>; channelIds?: string[]; enabled?: boolean }): AlertRule => { const id = input.id ?? `rule-${randomUUID()}`; const now = Date.now(); db.prepare(`INSERT INTO alert_rules(id,type,name,node_id,config_json,channel_ids_json,enabled,reconcile_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'pending',?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,name=excluded.name,node_id=excluded.node_id,config_json=excluded.config_json,channel_ids_json=excluded.channel_ids_json,enabled=excluded.enabled,reconcile_status='pending',updated_at=excluded.updated_at`).run(id, input.type, input.name.trim().slice(0, 80), input.nodeId ?? null, JSON.stringify(input.config ?? {}), JSON.stringify(input.channelIds ?? []), input.enabled === false ? 0 : 1, now, now); return listRules().find((rule) => rule.id === id) as AlertRule; };
  const deleteRule = (id: string) => db.prepare("DELETE FROM alert_rules WHERE id = ?").run(id).changes > 0;
  const enqueue = (eventType: string, payload: unknown) => {
    const channels = db.prepare("SELECT id FROM notification_channels WHERE enabled = 1").all() as Array<{ id: string }>;
    const insert = db.prepare("INSERT OR IGNORE INTO notification_outbox(idempotency_key,channel_id,event_type,payload_json,status,attempts,next_attempt_at,created_at) VALUES (?,?,?,?,?,?,?,?)");
    const tx = db.transaction(() => channels.forEach((channel) => insert.run(`${eventType}:${JSON.stringify(payload)}:${channel.id}`, channel.id, eventType, JSON.stringify(payload), "pending", 0, Date.now(), Date.now())));
    tx();
    return channels.length;
  };
  const dispatchPending = async (logger?: { warn: (message: string, details?: unknown) => void }) => {
    const rows = db.prepare("SELECT id,idempotency_key,channel_id,event_type,payload_json,attempts FROM notification_outbox WHERE status='pending' AND next_attempt_at <= ? ORDER BY id LIMIT 20").all(Date.now()) as Array<{ id: number; channel_id: string; event_type: string; payload_json: string; attempts: number }>;
    let sent = 0;
    for (const row of rows) {
      const config = getConfig(row.channel_id); const channel = db.prepare("SELECT type FROM notification_channels WHERE id = ? AND enabled = 1").get(row.channel_id) as { type?: NotificationChannelType } | undefined;
      try {
        if (!channel || !config) throw new Error("channel disabled or missing");
        if (channel.type === "webhook") { const response = await fetch(String(config.url), { method: "POST", headers: { "content-type": "application/json" }, body: row.payload_json }); if (!response.ok) throw new Error(`webhook status ${response.status}`); }
        else if (channel.type === "telegram") { const token = String(config.botToken ?? ""); const chatId = String(config.chatId ?? ""); const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: JSON.stringify(JSON.parse(row.payload_json)).slice(0, 3500) }) }); if (!response.ok) throw new Error(`telegram status ${response.status}`); }
        else await sendSmtp(config, row.payload_json);
        db.prepare("UPDATE notification_outbox SET status='sent',sent_at=? WHERE id=?").run(Date.now(), row.id); sent++;
      } catch (error) { const attempts = row.attempts + 1; db.prepare("UPDATE notification_outbox SET attempts=?,last_error=?,next_attempt_at=?,status=? WHERE id=?").run(attempts, error instanceof Error ? error.message.slice(0, 240) : "send failed", Date.now() + Math.min(60 * 60 * 1000, 2 ** Math.min(attempts, 8) * 1000), attempts >= 8 ? "failed" : "pending", row.id); logger?.warn("notification delivery failed", error); }
    }
    return sent;
  };
  return { listChannels, saveChannel, deleteChannel, listRules, saveRule, deleteRule, getConfig, enqueue, dispatchPending };
}
