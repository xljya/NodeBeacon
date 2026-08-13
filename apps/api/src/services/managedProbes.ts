export const MANAGED_PROBE_TARGET_LIMIT = 100;

export const MANAGED_PROBE_RESOURCES = {
  http: "nodebeacon-managed-http",
  tcp: "nodebeacon-managed-tcp",
  tcp6: "nodebeacon-managed-tcp6",
  icmp: "nodebeacon-managed-icmp"
} as const;

export const MANAGED_PROBE_JOBS = Object.values(MANAGED_PROBE_RESOURCES);

export type ManagedProbeFamily = keyof typeof MANAGED_PROBE_RESOURCES;

export function isIpv6TcpTarget(target: string): boolean {
  const value = target.trim().toLowerCase();
  return value.includes("-v6.") || value.startsWith("[");
}

export function tcpFamilyForTarget(target: string): "tcp" | "tcp6" {
  return isIpv6TcpTarget(target) ? "tcp6" : "tcp";
}

export function groupManagedProbeTargets(
  rows: Array<{ protocol: string; target: string }>
): Record<ManagedProbeFamily, string[]> {
  const grouped: Record<ManagedProbeFamily, string[]> = {
    http: [],
    tcp: [],
    tcp6: [],
    icmp: []
  };
  for (const row of rows) {
    if (row.protocol === "http") grouped.http.push(row.target);
    else if (row.protocol === "icmp") grouped.icmp.push(row.target);
    else if (row.protocol === "tcp") grouped[tcpFamilyForTarget(row.target)].push(row.target);
  }
  for (const family of Object.keys(grouped) as ManagedProbeFamily[]) {
    grouped[family] = grouped[family].slice(0, MANAGED_PROBE_TARGET_LIMIT);
  }
  return grouped;
}
