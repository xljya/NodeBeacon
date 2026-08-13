/**
 * Allow-listed nationwide China ISP TCP ping targets.
 * Hostname format follows the public zstaticcdn.com ISP nodes used by the
 * Komari batch-ping community script: `{province}-{carrier}-{v4|v6}.ip.zstaticcdn.com:80`.
 * NodeBeacon probes these from RS1000 Blackbox, not from per-node agents.
 */

export const CHINA_ISP_PING_DOMAIN = "zstaticcdn.com";
export const CHINA_ISP_PING_PORT = 80;

export const CHINA_ISP_PROVINCES = [
  { code: "bj", name: "北京" },
  { code: "tj", name: "天津" },
  { code: "sh", name: "上海" },
  { code: "cq", name: "重庆" },
  { code: "he", name: "河北" },
  { code: "sx", name: "山西" },
  { code: "ln", name: "辽宁" },
  { code: "jl", name: "吉林" },
  { code: "hl", name: "黑龙江" },
  { code: "js", name: "江苏" },
  { code: "zj", name: "浙江" },
  { code: "ah", name: "安徽" },
  { code: "fj", name: "福建" },
  { code: "jx", name: "江西" },
  { code: "sd", name: "山东" },
  { code: "ha", name: "河南" },
  { code: "hb", name: "湖北" },
  { code: "hn", name: "湖南" },
  { code: "gd", name: "广东" },
  { code: "gx", name: "广西" },
  { code: "hi", name: "海南" },
  { code: "sc", name: "四川" },
  { code: "gz", name: "贵州" },
  { code: "yn", name: "云南" },
  { code: "xz", name: "西藏" },
  { code: "sn", name: "陕西" },
  { code: "gs", name: "甘肃" },
  { code: "qh", name: "青海" },
  { code: "nx", name: "宁夏" },
  { code: "xj", name: "新疆" },
  { code: "nm", name: "内蒙古" }
] as const;

export const CHINA_ISP_CARRIERS = [
  { code: "cm", name: "移动" },
  { code: "cu", name: "联通" },
  { code: "ct", name: "电信" }
] as const;

export const CHINA_ISP_DEFAULT_PROVINCE_CODES = [
  "bj", "sh", "gd", "js", "zj", "sd", "ha", "hb", "hn", "fj",
  "sc", "cq", "yn", "sn", "xj", "ln", "hl", "nm", "gx", "hi"
] as const;

export const CHINA_ISP_IP_FAMILIES = ["v4", "v6"] as const;

export type ChinaIspProvinceCode = (typeof CHINA_ISP_PROVINCES)[number]["code"];
export type ChinaIspCarrierCode = (typeof CHINA_ISP_CARRIERS)[number]["code"];
export type ChinaIspIpFamily = (typeof CHINA_ISP_IP_FAMILIES)[number];

export interface ChinaIspPingTask {
  name: string;
  protocol: "tcp";
  target: string;
  ipFamily: ChinaIspIpFamily;
}

const PROVINCE_BY_CODE = new Map(CHINA_ISP_PROVINCES.map((item) => [item.code, item]));
const CARRIER_BY_CODE = new Map(CHINA_ISP_CARRIERS.map((item) => [item.code, item]));
const IP_FAMILY_SET = new Set<string>(CHINA_ISP_IP_FAMILIES);

export function chinaIspPingCatalog() {
  return {
    domain: CHINA_ISP_PING_DOMAIN,
    port: CHINA_ISP_PING_PORT,
    vantage: "rs1000-blackbox",
    maxTargetsPerFamily: 100,
    defaultProvinceCodes: [...CHINA_ISP_DEFAULT_PROVINCE_CODES],
    provinces: CHINA_ISP_PROVINCES.map((item) => ({ code: item.code, name: item.name })),
    carriers: CHINA_ISP_CARRIERS.map((item) => ({ code: item.code, name: item.name })),
    ipFamilies: [...CHINA_ISP_IP_FAMILIES]
  };
}

function uniqueCodes(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const code = value.trim().toLowerCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}

export function buildChinaIspPingTasks(input: {
  provinces: string[];
  carriers: string[];
  ipFamilies: string[];
}): ChinaIspPingTask[] {
  const provinces = uniqueCodes(input.provinces);
  const carriers = uniqueCodes(input.carriers);
  const ipFamilies = uniqueCodes(input.ipFamilies);
  if (!provinces.length || !carriers.length || !ipFamilies.length) {
    throw new Error("Select at least one province, carrier, and IP family.");
  }

  const tasks: ChinaIspPingTask[] = [];
  for (const provinceCode of provinces) {
    const province = PROVINCE_BY_CODE.get(provinceCode as ChinaIspProvinceCode);
    if (!province) throw new Error(`Unknown province: ${provinceCode}`);
    for (const carrierCode of carriers) {
      const carrier = CARRIER_BY_CODE.get(carrierCode as ChinaIspCarrierCode);
      if (!carrier) throw new Error(`Unknown carrier: ${carrierCode}`);
      for (const ipFamily of ipFamilies) {
        if (!IP_FAMILY_SET.has(ipFamily)) throw new Error(`Unknown IP family: ${ipFamily}`);
        const family = ipFamily as ChinaIspIpFamily;
        const ipLabel = family === "v4" ? "IPv4" : "IPv6";
        tasks.push({
          name: `${province.name}${carrier.name} ${ipLabel}`,
          protocol: "tcp",
          target: `${province.code}-${carrier.code}-${family}.ip.${CHINA_ISP_PING_DOMAIN}:${CHINA_ISP_PING_PORT}`,
          ipFamily: family
        });
      }
    }
  }
  return tasks;
}

const CATALOG_TARGETS = new Set(
  buildChinaIspPingTasks({
    provinces: CHINA_ISP_PROVINCES.map((item) => item.code),
    carriers: CHINA_ISP_CARRIERS.map((item) => item.code),
    ipFamilies: [...CHINA_ISP_IP_FAMILIES]
  }).map((task) => task.target)
);

export function isChinaIspCatalogTarget(target: string): boolean {
  return CATALOG_TARGETS.has(target.trim().toLowerCase());
}
