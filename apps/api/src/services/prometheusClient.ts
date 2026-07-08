import type { ApiEnv } from "../config/env.js";

export interface PrometheusVectorResult {
  metric: Record<string, string>;
  value: [number, string];
}

export interface PrometheusMatrixResult {
  metric: Record<string, string>;
  values: Array<[number, string]>;
}

interface PrometheusQueryResponse {
  status: "success" | "error";
  data?: {
    resultType: string;
    result: unknown[];
  };
  errorType?: string;
  error?: string;
}

export class PrometheusQueryError extends Error {
  constructor(
    message: string,
    readonly code: "http_error" | "timeout" | "bad_response" | "prometheus_error",
    readonly statusCode?: number
  ) {
    super(message);
    this.name = "PrometheusQueryError";
  }
}

export interface PrometheusClientOptions {
  baseUrl: string;
  timeoutMs: number;
  basicAuthUsername?: string;
  basicAuthPassword?: string;
  bearerToken?: string;
}

export class PrometheusClient {
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #headers: HeadersInit;

  constructor(options: PrometheusClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#timeoutMs = options.timeoutMs;
    this.#headers = this.#buildHeaders(options);
  }

  async query(query: string): Promise<PrometheusVectorResult[]> {
    const endpoint = new URL(`${this.#baseUrl}/api/v1/query`);
    endpoint.searchParams.set("query", query);
    const data = await this.#request(endpoint);
    if (data.resultType !== "vector") {
      throw new PrometheusQueryError("Prometheus returned an unsupported response shape.", "bad_response");
    }
    return data.result as PrometheusVectorResult[];
  }

  /** Runs /api/v1/query_range. start/end are unix seconds, step in seconds. */
  async queryRange(
    query: string,
    startSeconds: number,
    endSeconds: number,
    stepSeconds: number
  ): Promise<PrometheusMatrixResult[]> {
    const endpoint = new URL(`${this.#baseUrl}/api/v1/query_range`);
    endpoint.searchParams.set("query", query);
    endpoint.searchParams.set("start", String(startSeconds));
    endpoint.searchParams.set("end", String(endSeconds));
    endpoint.searchParams.set("step", String(stepSeconds));
    const data = await this.#request(endpoint);
    if (data.resultType !== "matrix") {
      throw new PrometheusQueryError("Prometheus returned an unsupported response shape.", "bad_response");
    }
    return data.result as PrometheusMatrixResult[];
  }

  async #request(endpoint: URL): Promise<{ resultType: string; result: unknown[] }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

    try {
      const response = await fetch(endpoint, {
        headers: this.#headers,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new PrometheusQueryError(
          `Prometheus returned HTTP ${response.status}.`,
          "http_error",
          response.status
        );
      }

      const payload = await response.json() as PrometheusQueryResponse;
      if (payload.status !== "success") {
        throw new PrometheusQueryError(
          payload.error ?? payload.errorType ?? "Prometheus query failed.",
          "prometheus_error"
        );
      }

      if (!payload.data || !Array.isArray(payload.data.result)) {
        throw new PrometheusQueryError("Prometheus returned an unsupported response shape.", "bad_response");
      }

      return payload.data;
    } catch (error) {
      if (error instanceof PrometheusQueryError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new PrometheusQueryError("Prometheus query timed out.", "timeout");
      }
      throw new PrometheusQueryError(
        error instanceof Error ? error.message : "Prometheus query failed.",
        "bad_response"
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async queryNumber(query: string): Promise<number | null> {
    const result = await this.query(query);
    const first = result[0];
    if (!first) return null;
    const raw = first.value[1];
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  #buildHeaders(options: PrometheusClientOptions): HeadersInit {
    const headers: Record<string, string> = {
      accept: "application/json"
    };

    if (options.bearerToken) {
      headers.authorization = `Bearer ${options.bearerToken}`;
      return headers;
    }

    if (options.basicAuthUsername && options.basicAuthPassword) {
      const token = Buffer
        .from(`${options.basicAuthUsername}:${options.basicAuthPassword}`, "utf8")
        .toString("base64");
      headers.authorization = `Basic ${token}`;
    }

    return headers;
  }
}

export function createPrometheusClient(env: ApiEnv): PrometheusClient | null {
  if (!env.prometheusUrl) return null;
  return new PrometheusClient({
    baseUrl: env.prometheusUrl,
    timeoutMs: env.prometheusTimeoutMs,
    basicAuthUsername: env.prometheusBasicAuthUsername,
    basicAuthPassword: env.prometheusBasicAuthPassword,
    bearerToken: env.prometheusBearerToken
  });
}
