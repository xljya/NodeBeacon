# NodeBeacon deployment (RS1000 k3s)

Single container (ADR-0005): the Fastify API serves `/api/*` and hosts the built
web bundle. Deployed to the RS1000 k3s cluster in the `nodebeacon` namespace and
exposed on NodePort `31003`, which the existing RS1000 nginx already proxies for
`monitor.liucf.com`.

```
monitor.liucf.com
  -> Cloudflare (proxied)
  -> RS1000 nginx :443            (infra/nginx/monitor.liucf.com.conf)
  -> http://10.77.0.1:31003       (Service nodebeacon, NodePort 31003)
  -> Deployment nodebeacon        (Pod: web + Fastify API on :3001)
  -> Prometheus (in-cluster)      monitoring-kube-prometheus-prometheus.monitoring.svc:9090
```

## Files

| File | Purpose |
| --- | --- |
| `k8s/namespace.yaml` | `nodebeacon` namespace |
| `k8s/configmap-nodes.yaml` | Node registry (`/config/nodes.yaml`), Prometheus label mapping |
| `k8s/secret.example.yaml` | Reserved secrets (P3). Copy + fill privately; never commit real values |
| `k8s/deployment.yaml` | App Deployment, env, probes, security context |
| `k8s/service.yaml` | NodePort 31003 |
| `k8s/pvc.yaml` | Placeholder PVC for P3 SQLite (`/data`) |
| `k8s/kustomization.yaml` | `kubectl apply -k k8s` (Secret excluded on purpose) |
| `nginx/monitor.liucf.com.conf` | Committed copy of the live RS1000 nginx entry |

## Prometheus label mapping (verified against live RS1000)

`metricsService` builds PromQL from each node's `labels`, so they must match what
Prometheus actually scrapes:

| Node | Selector |
| --- | --- |
| rs1000 | `{job="node-exporter"}` (in-cluster DaemonSet, single-node) |
| dmit-uswest / hostbrr-4t / netcup-1o / huawei-2c1g | `{job="external-vps-node", instance="<name>"}` |

Re-verify after any Prometheus scrape-config change:

```sh
curl -s "$PROMETHEUS_URL/api/v1/query" --data-urlencode 'query=up' \
  | jq '.data.result[].metric | {job, instance}'
```

## Build and load the image (on RS1000)

The image is built on the node with Docker and imported into k3s containerd. No
external registry is used, so the Deployment uses `imagePullPolicy: Never`.

```sh
# From a checkout of this repo on RS1000:
docker build -t nodebeacon:0.2.0 .
docker save nodebeacon:0.2.0 | sudo k3s ctr images import -
```

## Deploy

```sh
kubectl apply -k infra/k8s

# Create the Secret out of band (never committed). COOKIE_SECRET signs the
# session cookie; INITIAL_OWNER_* provisions the /admin owner account.
kubectl -n nodebeacon create secret generic nodebeacon-secrets \
  --from-literal=COOKIE_SECRET="$(openssl rand -hex 32)" \
  --from-literal=INITIAL_OWNER_EMAIL="you@example.com" \
  --from-literal=INITIAL_OWNER_PASSWORD="a-strong-password"

# The pod reads the Secret via envFrom; restart to pick up changes:
kubectl -n nodebeacon rollout restart deploy/nodebeacon
```

## Verify

```sh
kubectl -n nodebeacon rollout status deploy/nodebeacon
kubectl -n nodebeacon get pods -o wide

# Real data through the NodePort:
curl -s http://10.77.0.1:31003/api/status | jq '.summary, (.nodes[] | {id, status, cpu: .metrics.cpuPercent})'

# Through nginx (Cloudflare header guard requires the CF-Connecting-IP header):
curl -s -H 'CF-Connecting-IP: 127.0.0.1' -H 'Host: monitor.liucf.com' http://10.77.0.1/api/status | jq '.summary'
```

## Roll back

```sh
kubectl -n nodebeacon rollout undo deploy/nodebeacon
# or drop the whole stack:
kubectl delete -k infra/k8s
```

## Update to a new build

```sh
docker build -t nodebeacon:<new-tag> .
docker save nodebeacon:<new-tag> | sudo k3s ctr images import -
# bump image tag in k8s/deployment.yaml, then:
kubectl apply -k infra/k8s
kubectl -n nodebeacon rollout status deploy/nodebeacon
```
