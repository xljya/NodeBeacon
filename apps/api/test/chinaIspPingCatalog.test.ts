import { describe, expect, it } from "vitest";
import {
  buildChinaIspPingTasks,
  chinaIspPingCatalog,
  CHINA_ISP_DEFAULT_PROVINCE_CODES
} from "../src/services/chinaIspPingCatalog.js";
import { groupManagedProbeTargets, isIpv6TcpTarget } from "../src/services/managedProbes.js";

describe("china ISP ping catalog", () => {
  it("lists mainland provinces, three carriers, and the core-20 default", () => {
    const catalog = chinaIspPingCatalog();
    expect(catalog.provinces).toHaveLength(31);
    expect(catalog.carriers.map((item) => item.code)).toEqual(["cm", "cu", "ct"]);
    expect(catalog.defaultProvinceCodes).toEqual([...CHINA_ISP_DEFAULT_PROVINCE_CODES]);
    expect(catalog.vantage).toBe("rs1000-blackbox");
  });

  it("builds the zstaticcdn TCP hostname used by the community batch script", () => {
    const tasks = buildChinaIspPingTasks({
      provinces: ["xj"],
      carriers: ["ct"],
      ipFamilies: ["v4"]
    });
    expect(tasks).toEqual([
      {
        name: "新疆电信 IPv4",
        protocol: "tcp",
        target: "xj-ct-v4.ip.zstaticcdn.com:80",
        ipFamily: "v4"
      }
    ]);
  });

  it("expands the default IPv4 core-20 selection to 60 TCP targets", () => {
    const tasks = buildChinaIspPingTasks({
      provinces: [...CHINA_ISP_DEFAULT_PROVINCE_CODES],
      carriers: ["cm", "cu", "ct"],
      ipFamilies: ["v4"]
    });
    expect(tasks).toHaveLength(60);
    expect(tasks.every((task) => task.target.endsWith(".ip.zstaticcdn.com:80"))).toBe(true);
  });

  it("rejects unknown codes instead of interpolating attacker-controlled hostnames", () => {
    expect(() => buildChinaIspPingTasks({
      provinces: ["evil.example"],
      carriers: ["ct"],
      ipFamilies: ["v4"]
    })).toThrow(/unknown province/i);
  });
});

describe("managed probe grouping", () => {
  it("splits TCP targets into IPv4 and IPv6 Probe resources", () => {
    expect(isIpv6TcpTarget("xj-ct-v6.ip.zstaticcdn.com:80")).toBe(true);
    expect(isIpv6TcpTarget("[2001:db8::1]:80")).toBe(true);
    expect(isIpv6TcpTarget("xj-ct-v4.ip.zstaticcdn.com:80")).toBe(false);
    expect(groupManagedProbeTargets([
      { protocol: "tcp", target: "xj-ct-v4.ip.zstaticcdn.com:80" },
      { protocol: "tcp", target: "xj-ct-v6.ip.zstaticcdn.com:80" },
      { protocol: "http", target: "https://example.com" }
    ])).toEqual({
      http: ["https://example.com"],
      tcp: ["xj-ct-v4.ip.zstaticcdn.com:80"],
      tcp6: ["xj-ct-v6.ip.zstaticcdn.com:80"],
      icmp: []
    });
  });
});
