import type { AdminAlert, AdminAlertsResponse } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import { alertmanagerReadDurationSeconds, alertmanagerReadsTotal } from "../observability/metrics.js";

interface AlertmanagerAlert {
  fingerprint?: string;
  status?: { state?: string };
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  startsAt?: string;
  endsAt?: string;
  updatedAt?: string;
  generatorURL?: string;
}

interface CachedAlerts {
  expiresAt: number;
  value: AdminAlertsResponse;
}

export class AlertmanagerError extends Error {
  constructor(message: string, readonly statusCode?: number) {
    super(message);
    this.name = "AlertmanagerError";
  }
}

export interface AlertmanagerService {
  getActiveAlerts(): Promise<AdminAlertsResponse>;
}

export function createAlertmanagerService(env: ApiEnv): AlertmanagerService {
  let cache: CachedAlerts | null = null;

  return {
    async getActiveAlerts(): Promise<AdminAlertsResponse> {
      const now = Date.now();
      if (!env.alertmanagerUrl) {
        return { configured: false, generatedAt: new Date(now).toISOString(), alerts: [] };
      }
      if (cache && cache.expiresAt > now) return cache.value;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), env.alertmanagerTimeoutMs);
      const stopTimer = alertmanagerReadDurationSeconds.startTimer();
      try {
        const url = `${env.alertmanagerUrl.replace(/\/+$/, "")}/api/v2/alerts`;
        const response = await fetch(url, {
          headers: { accept: "application/json" },
          signal: controller.signal
        });
        if (!response.ok) {
          throw new AlertmanagerError(`Alertmanager returned HTTP ${response.status}.`, response.status);
        }
        const payload = await response.json() as unknown;
        if (!Array.isArray(payload)) throw new AlertmanagerError("Alertmanager returned an invalid alerts payload.");

        const alerts = payload
          .map((raw): AdminAlert | null => {
            const alert = raw as AlertmanagerAlert;
            if (!alert.fingerprint || !alert.startsAt || !alert.endsAt) return null;
            return {
              fingerprint: alert.fingerprint,
              state: alert.status?.state ?? "unknown",
              labels: alert.labels ?? {},
              annotations: alert.annotations ?? {},
              startsAt: alert.startsAt,
              endsAt: alert.endsAt,
              updatedAt: alert.updatedAt,
              generatorUrl: alert.generatorURL
            };
          })
          .filter((alert): alert is AdminAlert => alert !== null && alert.state === "active")
          .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));

        const value: AdminAlertsResponse = {
          configured: true,
          generatedAt: new Date(now).toISOString(),
          alerts
        };
        cache = { value, expiresAt: now + 15_000 };
        alertmanagerReadsTotal.inc({ outcome: "success" });
        return value;
      } catch (error) {
        alertmanagerReadsTotal.inc({
          outcome: error instanceof Error && error.name === "AbortError" ? "timeout" : "error"
        });
        if (error instanceof AlertmanagerError) throw error;
        if (error instanceof Error && error.name === "AbortError") {
          throw new AlertmanagerError("Alertmanager request timed out.");
        }
        throw new AlertmanagerError(error instanceof Error ? error.message : "Alertmanager request failed.");
      } finally {
        stopTimer();
        clearTimeout(timeout);
      }
    }
  };
}
