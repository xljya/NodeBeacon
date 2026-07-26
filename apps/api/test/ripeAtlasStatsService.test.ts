import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RipeAtlasConfig } from "../src/services/ripeAtlasCollector.js";
import {
  calculateRipeAtlasLatencyStats,
  clearRipeAtlasStatsCache,
  getRipeAtlasLatencyStats
} from "../src/services/ripeAtlasStatsService.js";

const config: RipeAtlasConfig = {
  version: 1,
  provider: "ripe-atlas",
  createdAt: "2026-07-26T00:00:00.000Z",
  intervalSeconds: 300,
  probes: [{
    id: 1009298,
    key: "zhejiang_mobile",
    label: "浙江移动",
    provider: "China Mobile",
    asn: 56041,
    city: "Zhejiang"
  }],
  measurements: [{ nodeId: "rs1000", measurementId: 193845936 }]
};

const nowSeconds = 2_000_000_000;
const results = [
  {
    type: "ping",
    prb_id: 1009298,
    timestamp: nowSeconds - 600,
    sent: 3,
    rcvd: 2,
    avg: 15,
    result: [{ rtt: 10 }, { rtt: 20 }, { x: "*" }]
  },
  {
    type: "ping",
    prb_id: 1009298,
    timestamp: nowSeconds - 300,
    sent: 3,
    rcvd: 1,
    avg: 30,
    result: [{ rtt: 30 }, { x: "*" }, { x: "*" }]
  },
  {
    type: "ping",
    prb_id: 1009298,
    timestamp: nowSeconds,
    sent: 3,
    rcvd: 0,
    result: [{ x: "*" }, { x: "*" }, { x: "*" }]
  }
];

beforeEach(() => clearRipeAtlasStatsCache());

describe("RIPE Atlas latency statistics", () => {
  it("calculates packet-level values from real raw ping results", () => {
    const stats = calculateRipeAtlasLatencyStats(config, "rs1000", "zhejiang_mobile", results, nowSeconds);
    expect(stats).toMatchObject({
      nodeId: "rs1000",
      vantage: "zhejiang_mobile",
      vantageName: "浙江移动",
      windowSeconds: 86_400,
      intervalSeconds: 300,
      type: "ICMP",
      minimumMs: 10,
      maximumMs: 30,
      averageMs: 20,
      latestMs: 30,
      p50Ms: 20,
      sampleCount: 3,
      validSampleCount: 2,
      packetsSent: 9,
      packetsReceived: 3
    });
    expect(stats?.packetLossPercent).toBeCloseTo(66.6667, 3);
    expect(stats?.p99Ms).toBeCloseTo(29.8);
    expect(stats?.standardDeviationMs).toBeCloseTo(8.16497);
    expect(stats?.jitterMs).toBe(15);
    expect(stats?.updatedAt).toBe(new Date((nowSeconds - 300) * 1000).toISOString());
  });

  it("requests only the configured public measurement and probe", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(results), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    const stats = await getRipeAtlasLatencyStats(config, "rs1000", "zhejiang_mobile", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      nowSeconds
    });

    expect(stats?.source).toEqual({
      provider: "China Mobile",
      probeId: 1009298,
      asn: "AS56041",
      city: "Zhejiang",
      measurementId: 193845936
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/v2/measurements/193845936/results/");
    expect(url.searchParams.get("probe_ids")).toBe("1009298");
    expect(url.searchParams.get("start")).toBe(String(nowSeconds - 86_400));
    expect(url.searchParams.get("stop")).toBe(String(nowSeconds));
  });

  it("does not fetch an unknown node or vantage", async () => {
    const fetchMock = vi.fn();
    await expect(getRipeAtlasLatencyStats(config, "missing", "zhejiang_mobile", {
      fetchImpl: fetchMock as unknown as typeof fetch,
      nowSeconds
    })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
