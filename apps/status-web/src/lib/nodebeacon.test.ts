import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPublicNodeLatencyStatsPath, buildPublicNodeSeriesPath, getNodeDetailPath } from "./nodebeacon.ts";

describe("node detail handoff", () => {
  it("links the public shell to the in-shell node detail path", () => {
    assert.equal(getNodeDetailPath("rs1000"), "/nodes/rs1000");
    assert.equal(getNodeDetailPath("a/b"), "/nodes/a%2Fb");
  });

  it("builds a whitelist-only public series URL", () => {
    assert.equal(
      buildPublicNodeSeriesPath("rs1000", { metrics: ["cpu", "rate(evil)", "memory"], range: "1d" }),
      "/api/public/nodes/rs1000/series?metrics=cpu%2Cmemory&range=1d&aggregation=avg",
    );
    assert.equal(
      buildPublicNodeSeriesPath("a/b", { metrics: ["latency"], range: "bogus" }),
      "/api/public/nodes/a%2Fb/series?metrics=latency&range=1d&aggregation=avg",
    );
    assert.equal(buildPublicNodeSeriesPath("rs1000", { metrics: ["promql"], range: "1d" }), null);
    assert.equal(
      buildPublicNodeSeriesPath("rs1000", { metrics: ["cpu", "connections"], range: "realtime" }),
      "/api/public/nodes/rs1000/series?metrics=cpu%2Cconnections&range=realtime&aggregation=avg",
    );
  });

  it("builds a whitelist-only latency-stats URL", () => {
    assert.equal(
      buildPublicNodeLatencyStatsPath("rs1000", "zhejiang_mobile"),
      "/api/public/nodes/rs1000/latency-stats?vantage=zhejiang_mobile",
    );
    assert.equal(buildPublicNodeLatencyStatsPath("rs1000", "promql"), null);
    assert.equal(buildPublicNodeLatencyStatsPath("a/b", "ping"), "/api/public/nodes/a%2Fb/latency-stats?vantage=ping");
  });
});

import { toKomariLiveRecord, type NodeBeaconStatusNode } from "./nodebeacon.ts";
it("keeps calibrated cycle usage separate from since-boot counters", () => {
  const traffic = {source:"calibrated_estimate",status:"ok",quota:500,unit:"GiB",mode:"sum",rx:40,tx:45,used:85,remaining:415,periodStart:"2026-09-22T00:00:00Z",periodEnd:"2026-10-22T00:00:00Z",resetVerified:false,calibratedAt:"2026-10-02T00:00:00Z",updatedAt:"2026-10-02T00:05:00Z"};
  const node = {metrics:{networkRxBytesTotal:555e9,networkTxBytesTotal:554e9},traffic} as unknown as NodeBeaconStatusNode;
  const record = toKomariLiveRecord(node);
  assert.deepEqual(record.network.cycle, traffic);
  assert.equal(record.network.totalDown,555e9);
  assert.equal(record.network.totalUp,554e9);
});
