// Read-only acceptance check. Run in the NodeBeacon Pod or with a reachable
// PROMETHEUS_URL. Never creates test incidents or sends notifications.
import assert from 'node:assert/strict';

const base = process.env.PROMETHEUS_URL ?? 'http://monitoring-kube-prometheus-prometheus.monitoring.svc:9090';
async function read(path) {
  const response = await fetch(`${base.replace(/\/$/, '')}/api/v1/${path}`, {
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(response.ok, true, `Prometheus HTTP ${response.status}`);
  const body = await response.json();
  assert.equal(body.status, 'success');
  return body.data;
}

const { groups } = await read('rules');
const rules = groups.flatMap(group => group.rules.map(rule => ({ ...rule, group: group.name })));
const crash = rules.filter(rule => rule.name === 'KubePodCrashLooping');
assert.equal(crash.length, 1, 'Expected exactly one loaded KubePodCrashLooping rule');
assert.equal(crash[0].group, 'kubernetes-apps');
assert.equal(crash[0].duration, 900, 'Keep the upstream 15-minute pending period');
for (const name of ['PublicEndpointDown', 'PublicEndpointCertificateExpiringSoon']) {
  assert.equal(rules.filter(rule => rule.name === name && rule.group === 'sre-lab.public-endpoints').length, 1);
}
assert.deepEqual(rules.filter(rule => rule.health !== 'ok').map(rule => rule.name), [], 'Unhealthy rules');

// These are the data dependencies of the existing Workload, Pod and PVC views.
const queries = {
  workloadCpu: 'sum(node_namespace_pod_container:container_cpu_usage_seconds_total:sum_rate5m{namespace="nodebeacon"} * on(cluster,namespace,pod) group_left(workload,workload_type) namespace_workload_pod:kube_pod_owner:relabel{namespace="nodebeacon",workload="nodebeacon",workload_type="deployment"})',
  podMemory: 'sum(container_memory_working_set_bytes{namespace="nodebeacon",container!="",image!=""})',
  persistentVolume: 'kubelet_volume_stats_available_bytes{namespace="nodebeacon",persistentvolumeclaim="nodebeacon-data"}',
};
for (const [name, query] of Object.entries(queries)) {
  const data = await read(`query?query=${encodeURIComponent(query)}`);
  assert.ok(data.result.length > 0, `${name}: no samples`);
  assert.ok(data.result.every(sample => Number.isFinite(Number(sample.value[1])) && Number(sample.value[1]) >= 0), `${name}: invalid samples`);
  console.log(`${name}: ${data.result.length} valid series`);
}
console.log(`PASS: ${groups.length} groups, ${rules.length} healthy rules; one upstream CrashLoop rule; public endpoint alerts and dashboard metrics available`);
