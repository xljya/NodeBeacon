import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, loginOwner } from "./helpers.js";

const traffic = {
  quota: 500, unit: "GiB", mode: "sum",
  periodStart: "2026-09-22T00:00:00Z", periodEnd: "2026-10-22T00:00:00Z",
  resetVerified: false,
  calibration: { observedAt: "2026-10-02T13:40:00Z", rx: 40, tx: 45 }
};
describe("provider traffic calibration", () => {
  let app: FastifyInstance;
  let cookies: Record<string, string>;
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "nb-traffic-"));
    const path = join(dir, "nodes.yaml");
    await writeFile(path, JSON.stringify({ nodes: [{ id: "test-node", name: "Test", labels: {job:"test"}, public:true }] }));
    app = await buildTestApp({ NODEBEACON_NODE_CONFIG: path });
    cookies = await loginOwner(app);
  });
  afterAll(async () => { await app.close(); await rm(dir, {recursive:true,force:true}); });
  it("persists a provider calibration rather than silently discarding it", async () => {
    const today = Date.now();
    const current = {...traffic, periodStart:new Date(today-86400000).toISOString(), periodEnd:new Date(today+86400000).toISOString(), calibration:{...traffic.calibration,observedAt:new Date(today-3600000).toISOString()}};
    const res = await app.inject({method:"PATCH",url:"/api/admin/nodes/test-node",cookies,payload:{traffic:current}});
    expect(res.statusCode).toBe(200);
    expect(res.json().node.traffic).toMatchObject(current);
    const publicRes = await app.inject({method:"GET",url:"/api/status"});
    const node = publicRes.json().nodes[0];
    expect(node.traffic.status).toBe("unavailable");
    expect(node.traffic.used).toBeNull();
    expect(node.traffic).not.toHaveProperty("calibration");
    expect(node).not.toHaveProperty("labels");
  });
  it("rejects malformed calibration rather than storing a misleading total", async () => {
    for (const patch of [{quota:-1},{unit:"TB"},{periodEnd:traffic.periodStart},{calibration:{...traffic.calibration,rx:-3}}]) {
      const res=await app.inject({method:"PATCH",url:"/api/admin/nodes/test-node",cookies,payload:{traffic:{...traffic,...patch}}});
      expect(res.statusCode).toBe(400);
    }
  });
  it("requires owner access to change calibration", async () => {
    const res=await app.inject({method:"PATCH",url:"/api/admin/nodes/test-node",payload:{traffic}});
    expect(res.statusCode).toBe(401);
  });
});

import { getTrafficUsage } from "../src/services/trafficUsageService.js";
import type { NodeConfigEntry, TrafficConfig } from "@nodebeacon/shared";
const node = {id:"test-node",labels:{job:"external-vps-node",instance:"test-node"},detail:{networkDevices:["eth0"]},traffic} as NodeConfigEntry;
const now = "2026-10-02T14:40:00Z";
function upstream(overrides: {delta?:number|null; age?:number|null; up?:number|null} = {}) {
  const queries:string[]=[];
  return {queries,queryNumber:async(q:string) => {
    queries.push(q);
    if(q.includes("increase(")) return overrides.delta===undefined ? 1024**3 : overrides.delta;
    if(q.includes("timestamp(")) return overrides.age===undefined ? 15 : overrides.age;
    return overrides.up===undefined ? 1 : overrides.up;
  }};
}
it("adds post-calibration increments and preserves the provider billing mode", async () => {
  for(const [mode,expected] of [["sum",87],["max",46],["rx",41],["tx",46]] as const) {
    const client=upstream();
    const result=await getTrafficUsage(client,{...node,traffic:{...traffic,mode} as TrafficConfig},now);
    expect(result).toMatchObject({status:"ok",rx:41,tx:46,used:expected,remaining:500-expected,source:"calibrated_estimate"});
    expect(client.queries.filter(q=>q.includes("increase("))).toHaveLength(2);
    expect(client.queries.every(q=>!q.includes("node-detail-fast"))).toBe(true);
    expect(client.queries[0]).toContain('device=~"eth0"');
  }
});
it("does not silently reset an expired provider cycle", async () => {
  const client=upstream();
  expect(await getTrafficUsage(client,node,"2026-10-22T00:00:00Z")).toMatchObject({status:"needs_calibration",used:null,remaining:null});
  expect(client.queries).toHaveLength(0);
});
it("does not turn missing or stale history, outages, or future snapshots into zero usage",async()=>{
  for(const client of [null,upstream({delta:null}),upstream({age:121}),upstream({up:0}),{queryNumber:async()=>{throw new Error("offline");}}]) {
    expect(await getTrafficUsage(client,node,now)).toMatchObject({status:"unavailable",used:null});
  }
  expect(await getTrafficUsage(upstream(),node,"2026-10-02T13:30:00Z")).toMatchObject({status:"unavailable",used:null});
});
it("supports decimal units and keeps over-quota usage while clamping only the remainder",async()=>{
  const result=await getTrafficUsage(upstream({delta:1e9}),{...node,traffic:{...traffic,unit:"GB",quota:50} as TrafficConfig},now);
  expect(result).toMatchObject({used:87,remaining:0,unit:"GB"});
});
