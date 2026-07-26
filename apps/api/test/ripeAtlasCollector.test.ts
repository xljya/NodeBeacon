import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  metricsRegistry,
  ripeAtlasCollectionDurationSeconds,
  ripeAtlasCollectionRequestsTotal,
  ripeAtlasLastCollectionSuccessTimestampSeconds,
  ripeAtlasProbeSuccess,
  ripeAtlasResultTimestampSeconds,
  ripeAtlasRttMilliseconds
} from "../src/observability/metrics.js";
import {
  collectRipeAtlasMeasurements,
  parseRipeAtlasConfig,
  type RipeAtlasConfig
} from "../src/services/ripeAtlasCollector.js";

const config: RipeAtlasConfig = {
  version: 1,
  provider: "ripe-atlas",
  createdAt: "2026-07-23T09:00:00.000Z",
  intervalSeconds: 300,
  probes: [
    {
      id: 1009298,
      key: "zhejiang_mobile",
      label: "浙江移动",
      provider: "China Mobile",
      asn: 56041,
      city: "Zhejiang"
    },
    {
      id: 55328,
      key: "zhejiang_telecom",
      label: "浙江电信",
      provider: "China Telecom",
      asn: 4134,
      city: "Hangzhou, Zhejiang"
    }
  ],
  measurements: [{ nodeId: "rs1000", measurementId: 9000001 }]
};

beforeEach(() => {
  ripeAtlasRttMilliseconds.reset();
  ripeAtlasProbeSuccess.reset();
  ripeAtlasResultTimestampSeconds.reset();
  ripeAtlasCollectionRequestsTotal.reset();
  ripeAtlasCollectionDurationSeconds.reset();
  ripeAtlasLastCollectionSuccessTimestampSeconds.reset();
});

describe("RIPE Atlas collector", () => {
  it("validates the generated non-secret mapping", () => {
    expect(parseRipeAtlasConfig(config)).toEqual(config);
    expect(() => parseRipeAtlasConfig({
      ...config,
      probes: [...config.probes, config.probes[0]]
    })).toThrow(/Duplicate RIPE Atlas probe/);
  });

  it("exports fresh RTT, source metadata, success and result timestamps", async () => {
    // The live RIPE Atlas API currently returns an array here, while its
    // documentation also permits a probe-ID-keyed object. The collector
    // deliberately accepts both shapes.
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      {
        type: "ping",
        prb_id: 1009298,
        avg: 18.25,
        rcvd: 3,
        sent: 3,
        timestamp: 2_000_000_000
      },
      {
        type: "ping",
        prb_id: 55328,
        rcvd: 0,
        sent: 3,
        timestamp: 2_000_000_000
      }
    ]), { status: 200, headers: { "content-type": "application/json" } }));

    await collectRipeAtlasMeasurements(config, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      nowSeconds: 2_000_000_100
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe("/api/v2/measurements/9000001/latest/");
    expect(requestedUrl.searchParams.get("probe_ids")).toBe("1009298,55328");
    const metrics = await metricsRegistry.metrics();
    expect(metrics).toContain('nodebeacon_ripe_atlas_rtt_milliseconds{node_id="rs1000",vantage="zhejiang_mobile"');
    expect(metrics).toContain('vantage_name="浙江移动"');
    expect(metrics).toContain('probe_id="1009298"');
    expect(metrics).toContain('asn="AS56041"');
    expect(metrics).toContain("} 18.25");
    expect(metrics).not.toContain('nodebeacon_ripe_atlas_rtt_milliseconds{node_id="rs1000",vantage="zhejiang_telecom"');
    expect(metrics).toContain('nodebeacon_ripe_atlas_probe_success{node_id="rs1000",vantage="zhejiang_telecom"');
    expect(metrics).toContain("} 0");
    expect(metrics).toContain("nodebeacon_ripe_atlas_last_collection_success_timestamp_seconds 2000000100");
    expect(metrics).not.toContain("124.71.");
  });

  it("removes stale RTT values instead of presenting them as current", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      "1009298": [{
        type: "ping",
        prb_id: 1009298,
        avg: 20,
        rcvd: 3,
        sent: 3,
        timestamp: 1_999_000_000
      }]
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await collectRipeAtlasMeasurements(config, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      nowSeconds: 2_000_000_100
    });

    const metrics = await metricsRegistry.metrics();
    expect(metrics).not.toContain("nodebeacon_ripe_atlas_rtt_milliseconds{");
    expect(metrics).toContain("nodebeacon_ripe_atlas_probe_success{");
  });
});
