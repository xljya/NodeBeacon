import type { ApiStatusResponse } from "@nodebeacon/shared";
import { apiGet } from "../lib/api";

let snapshot: ApiStatusResponse | null = null;
let pending: Promise<ApiStatusResponse> | null = null;

/** Reuse the latest public status response while switching between status routes. */
export function getStatusSnapshot(): ApiStatusResponse | null {
  return snapshot;
}

/** Deduplicate concurrent status reads and retain the last successful response. */
export function loadStatusSnapshot(): Promise<ApiStatusResponse> {
  if (pending) return pending;

  pending = apiGet<ApiStatusResponse>("/api/status")
    .then((response) => {
      snapshot = response;
      return response;
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}
