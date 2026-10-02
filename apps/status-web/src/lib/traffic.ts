export interface TrafficConfig {
  quota: number;
  unit: "GB" | "GiB";
  mode: "sum" | "max" | "tx" | "rx";
  periodStart: string;
  periodEnd: string;
  resetVerified: boolean;
  calibration: { observedAt: string; rx: number; tx: number };
}

/** Public-safe allowance summary; no credentials or provider account identifiers. */
export interface TrafficUsage {
  source: "calibrated_estimate";
  status: "ok" | "unavailable" | "needs_calibration";
  quota: number;
  unit: TrafficConfig["unit"];
  mode: TrafficConfig["mode"];
  periodStart: string;
  periodEnd: string;
  resetVerified: boolean;
  calibratedAt: string;
  updatedAt: string;
  rx: number | null;
  tx: number | null;
  used: number | null;
  remaining: number | null;
}

