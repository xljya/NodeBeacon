import { mkdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApiError } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import type { AuthService } from "../services/authService.js";
import type { AuditService } from "../services/auditService.js";
import type { SqliteDatabase } from "../services/database.js";
import type { SettingsService } from "../services/settingsService.js";
import { createRecoveryCodes, findTotpCodeStep, generateTotpSecret, otpauthUri, recoveryCodeHash } from "../services/totpService.js";
import { decryptSecret, encryptSecret } from "../services/secretService.js";
import { getPrometheusReachability } from "../services/statusService.js";

const SOURCE_LABELS: Record<string, string> = {
  nodebeacon: '{namespace="nodebeacon",app="nodebeacon"}',
  prometheus: '{namespace="monitoring",app="prometheus"}',
  alertmanager: '{namespace="monitoring",app="alertmanager"}',
  blackbox: '{namespace="monitoring",app="blackbox-exporter"}',
  loki: '{namespace="logging"}'
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function redact(value: string): string {
  return value.replace(/(authorization|cookie|password|passwd|token|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]");
}

function safeLimit(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(200, Math.max(1, Math.trunc(n))) : 100;
}

export async function registerAdminFoundationRoutes(
  app: FastifyInstance,
  env: ApiEnv,
  authService: AuthService,
  auditService: AuditService,
  settings: SettingsService,
  db: SqliteDatabase
): Promise<void> {
  const ownerOnly = { preHandler: app.requireOwner };

  app.get("/api/site-config", async () => ({ site: settings.getSite(), theme: settings.getDefaultTheme() }));
  app.get("/api/admin/settings/site", ownerOnly, async () => settings.getSite());
  app.patch("/api/admin/settings/site", ownerOnly, async (request) => settings.updateSite(asRecord(request.body)));
  app.get("/api/admin/settings/general", ownerOnly, async () => settings.getGeneral());
  app.patch("/api/admin/settings/general", ownerOnly, async (request) => settings.updateGeneral(asRecord(request.body)));
  app.get("/api/admin/settings/appearance", ownerOnly, async () => ({ theme: settings.getDefaultTheme(), themes: settings.listThemes() }));
  app.patch("/api/admin/settings/appearance", ownerOnly, async (request, reply) => {
    const body = asRecord(request.body);
    if (typeof body.themeId === "string") {
      const theme = settings.listThemes().find((item) => item.id === body.themeId);
      if (!theme) return reply.code(404).send(buildApiError("not_found", "Theme not found."));
      settings.saveTheme({ id: theme.id, name: theme.name, tokens: theme.tokens, isDefault: true });
    }
    return { theme: settings.getDefaultTheme() };
  });
  app.get("/api/admin/themes", ownerOnly, async () => ({ themes: settings.listThemes() }));
  app.post("/api/admin/themes", ownerOnly, async (request, reply) => {
    const body = asRecord(request.body);
    if (typeof body.name !== "string") return reply.code(400).send(buildApiError("invalid_request", "Theme name is required."));
    return settings.saveTheme({ name: body.name, tokens: body.tokens, isDefault: body.isDefault === true });
  });
  app.patch<{ Params: { id: string } }>("/api/admin/themes/:id", ownerOnly, async (request) => {
    const body = asRecord(request.body);
    const current = settings.listThemes().find((theme) => theme.id === request.params.id);
    if (!current) return { error: { code: "not_found", message: "Theme not found." } };
    return settings.saveTheme({ id: current.id, name: typeof body.name === "string" ? body.name : current.name, tokens: body.tokens ?? current.tokens, isDefault: typeof body.isDefault === "boolean" ? body.isDefault : current.isDefault });
  });
  app.delete<{ Params: { id: string } }>("/api/admin/themes/:id", ownerOnly, async (request, reply) => {
    if (!settings.deleteTheme(request.params.id)) return reply.code(400).send(buildApiError("invalid_request", "The default theme cannot be deleted."));
    return { status: "ok" };
  });

  app.get("/api/admin/account", ownerOnly, async () => {
    const user = authService.getUserById("owner");
    const factor = db.prepare("SELECT enabled FROM auth_factors WHERE user_id = ? AND type = 'totp'").get("owner") as { enabled?: number } | undefined;
    const recovery = db.prepare("SELECT COUNT(*) AS count FROM recovery_codes WHERE user_id = ? AND used_at IS NULL").get("owner") as { count: number };
    return { user, passwordLoginEnabled: authService.passwordLoginEnabled, githubLoginEnabled: authService.githubLoginEnabled, totpEnabled: factor?.enabled === 1, recoveryCodesRemaining: recovery.count };
  });
  app.post("/api/admin/account/password", ownerOnly, async (request, reply) => {
    const body = asRecord(request.body);
    const ok = await authService.changePassword(request.user?.email ?? "", String(body.currentPassword ?? ""), String(body.nextPassword ?? ""));
    if (!ok) return reply.code(400).send(buildApiError("invalid_request", "Current password is invalid or the new password is too short."));
    auditService.record({ actor: "owner", action: "auth.password_changed" });
    return { status: "ok" };
  });
  app.post("/api/admin/2fa/setup", ownerOnly, async (request, reply) => {
    const factor = db.prepare("SELECT enabled FROM auth_factors WHERE user_id = 'owner' AND type = 'totp'").get() as { enabled?: number } | undefined;
    if (factor?.enabled === 1) return reply.code(409).send(buildApiError("totp_already_enabled", "Two-factor authentication is already enabled."));
    const currentPassword = String(asRecord(request.body).currentPassword ?? "");
    if (!request.user || !currentPassword || !(await authService.verifyCredentials(request.user.email, currentPassword))) {
      return reply.code(400).send(buildApiError("reauthentication_required", "Enter the current Owner password to set up two-factor authentication."));
    }
    const secret = generateTotpSecret();
    db.prepare(`INSERT INTO auth_factors(user_id,type,secret_json,enabled,created_at,updated_at) VALUES ('owner','totp',?,0,?,?) ON CONFLICT(user_id,type) DO UPDATE SET secret_json=excluded.secret_json,enabled=0,updated_at=excluded.updated_at`).run(encryptSecret(env, secret), Date.now(), Date.now());
    return { secret, otpauthUri: otpauthUri(secret, authService.getUserById("owner")?.email ?? "owner") };
  });
  app.post("/api/admin/2fa/confirm", ownerOnly, async (request, reply) => {
    const code = String(asRecord(request.body).code ?? "");
    const row = db.prepare("SELECT secret_json, enabled FROM auth_factors WHERE user_id = ? AND type = 'totp'").get("owner") as { secret_json?: string; enabled?: number } | undefined;
    if (!row || row.enabled === 1) return reply.code(409).send(buildApiError("totp_already_enabled", "Two-factor authentication is already enabled."));
    const secret = row?.secret_json ? decryptSecret(env, row.secret_json) : null;
    const step = secret ? findTotpCodeStep(secret, code) : null;
    if (!secret || step === null) return reply.code(400).send(buildApiError("invalid_totp", "Invalid authenticator code."));
    const codes = createRecoveryCodes();
    const activated = db.transaction(() => {
      const enabled = db.prepare("UPDATE auth_factors SET enabled = 1, last_used_step = ?, updated_at = ? WHERE user_id = 'owner' AND type = 'totp' AND enabled = 0").run(step, Date.now());
      if (enabled.changes !== 1) return false;
      db.prepare("DELETE FROM recovery_codes WHERE user_id = 'owner'").run();
      const insert = db.prepare("INSERT INTO recovery_codes(user_id,code_hash,created_at) VALUES ('owner',?,?)");
      codes.forEach((item) => insert.run(recoveryCodeHash(item), Date.now()));
      return true;
    })();
    if (!activated) return reply.code(409).send(buildApiError("totp_already_enabled", "Two-factor authentication is already enabled."));
    auditService.record({ actor: "owner", action: "auth.totp_enabled" });
    return { status: "ok", recoveryCodes: codes };
  });
  app.post("/api/admin/2fa/recovery-codes", ownerOnly, async (request, reply) => {
    const code = String(asRecord(request.body).code ?? "");
    if (!authService.verifyTotpFactor(code)) return reply.code(400).send(buildApiError("invalid_totp", "A valid authenticator code is required."));
    const codes = createRecoveryCodes();
    db.transaction(() => {
      db.prepare("DELETE FROM recovery_codes WHERE user_id = 'owner'").run();
      const insert = db.prepare("INSERT INTO recovery_codes(user_id,code_hash,created_at) VALUES ('owner',?,?)");
      codes.forEach((item) => insert.run(recoveryCodeHash(item), Date.now()));
    })();
    auditService.record({ actor: "owner", action: "auth.recovery_codes_regenerated" });
    return { status: "ok", recoveryCodes: codes };
  });
  app.post("/api/admin/2fa/disable", ownerOnly, async (request, reply) => {
    const code = String(asRecord(request.body).code ?? "");
    if (!authService.verifyTotpFactor(code)) return reply.code(400).send(buildApiError("invalid_totp", "A valid authenticator code is required."));
    db.transaction(() => {
      db.prepare("DELETE FROM recovery_codes WHERE user_id = 'owner'").run();
      db.prepare("DELETE FROM auth_factors WHERE user_id = 'owner' AND type = 'totp'").run();
    })();
    auditService.record({ actor: "owner", action: "auth.totp_disabled" });
    return { status: "ok" };
  });

  app.get("/api/admin/data-sources", ownerOnly, async () => {
    let sqliteBytes = 0;
    try { sqliteBytes = statSync(env.databasePath).size; } catch { /* in-memory */ }
    const loki = env.lokiUrl ? await fetch(`${env.lokiUrl.replace(/\/$/, "")}/ready`).then((response) => response.ok).catch(() => false) : false;
    return { sources: [
      { id: "prometheus", configured: Boolean(env.prometheusUrl), reachable: getPrometheusReachability(env), host: env.prometheusUrl ? new URL(env.prometheusUrl).host : undefined },
      { id: "loki", configured: Boolean(env.lokiUrl), reachable: loki },
      { id: "sqlite", configured: true, reachable: true, bytes: sqliteBytes }
    ] };
  });

  app.get<{ Querystring: { source?: string; start?: string; end?: string; limit?: string; level?: string; text?: string } }>("/api/admin/logs", ownerOnly, async (request, reply) => {
    const source = request.query.source ?? "nodebeacon";
    const selector = SOURCE_LABELS[source];
    if (!selector) return reply.code(400).send(buildApiError("invalid_source", "Unsupported log source."));
    if (source === "loki" && !env.lokiUrl) return { source, entries: [], nextCursor: null };
    const requestedEnd = request.query.end ? Date.parse(request.query.end) : Date.now();
    const requestedStart = request.query.start ? Date.parse(request.query.start) : requestedEnd - 60 * 60 * 1000;
    const endMs = Number.isFinite(requestedEnd) ? requestedEnd : Date.now();
    const startMs = Number.isFinite(requestedStart) ? Math.max(requestedStart, endMs - 24 * 60 * 60 * 1000) : endMs - 60 * 60 * 1000;
    const end = endMs * 1_000_000;
    const start = startMs * 1_000_000;
    const limit = safeLimit(request.query.limit);
    if (!env.lokiUrl) return { source, entries: [], nextCursor: null };
    const params = new URLSearchParams({ query: selector, start: String(start), end: String(end), limit: String(limit), direction: "backward" });
    const response = await fetch(`${env.lokiUrl.replace(/\/$/, "")}/loki/api/v1/query_range?${params.toString()}`).catch(() => null);
    if (!response?.ok) return { source, entries: [], nextCursor: null };
    const payload = await response.json() as { data?: { result?: Array<{ stream?: Record<string, string>; values?: Array<[string, string]> }> } };
    const entries = (payload.data?.result ?? []).flatMap((result) => (result.values ?? []).map(([timestamp, line]) => ({ timestamp: new Date(Number(timestamp) / 1_000_000).toISOString(), labels: result.stream ?? {}, line: redact(line) }))).filter((entry) => (!request.query.text || entry.line.toLowerCase().includes(request.query.text.toLowerCase())) && (!request.query.level || entry.line.toLowerCase().includes(request.query.level.toLowerCase()))).slice(0, limit);
    return { source, entries, nextCursor: null };
  });

  app.get("/api/admin/backup/status", ownerOnly, async () => {
    const readJson = (path: string): unknown => { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } };
    return { request: readJson(env.backupRequestPath), lastResult: readJson(env.backupLastResultPath), lastSuccess: existsSync(env.backupSuccessTimestampPath) ? statSync(env.backupSuccessTimestampPath).mtime.toISOString() : null };
  });
  app.post("/api/admin/backup/run", ownerOnly, async (request, reply) => {
    const existing = existsSync(env.backupRequestPath) ? statSync(env.backupRequestPath).mtimeMs : 0;
    if (existing && Date.now() - existing < 60 * 60 * 1000) return reply.code(429).send(buildApiError("backup_rate_limited", "A backup was requested recently."));
    mkdirSync(dirname(env.backupRequestPath), { recursive: true });
    writeFileSync(env.backupRequestPath, JSON.stringify({ requestedAt: new Date().toISOString(), actor: request.user?.id ?? "owner" }) + "\n", { mode: 0o600 });
    auditService.record({ actor: request.user?.id ?? "owner", action: "backup.requested" });
    return { status: "requested" };
  });
}
