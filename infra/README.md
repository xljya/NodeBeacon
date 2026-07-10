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
| `k8s/configmap-nodes.yaml` | Node registry seed (`/config/nodes.yaml`), Prometheus label mapping |
| `k8s/secret.example.yaml` | Auth/OAuth secret template. Copy + fill privately; never commit real values |
| `k8s/deployment.yaml` | App Deployment, env, probes, security context |
| `k8s/service.yaml` | NodePort 31003 |
| `k8s/pvc.yaml` | Runtime YAML registry and SQLite state (`/data`) |
| `k8s/restore-pod.example.yaml` | One-shot PVC mount used only during a restore drill |
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

## Build, load and deploy (on RS1000)

The image is built on the node with Docker and imported into k3s containerd. No
external registry is used, so the Deployment uses `imagePullPolicy: Never`.

Preferred path — the release script does everything (version check → build →
import → apply → rollout wait → smoke checks). The release version is
single-sourced from the root `package.json`; the script refuses to run if
`k8s/deployment.yaml` references a different image tag:

```sh
# From a synced checkout of this repo on RS1000:
./scripts/deploy.sh
```

Manual fallback (what the script automates):

```sh
docker build -t nodebeacon:0.8.0 .
docker save nodebeacon:0.8.0 | sudo k3s ctr images import -
```

## Deploy

```sh
kubectl apply -k infra/k8s

# Create the Secret out of band (never committed). COOKIE_SECRET signs the
# session cookie; INITIAL_OWNER_* provisions the /admin owner account; GitHub
# values enable OAuth login.
kubectl -n nodebeacon create secret generic nodebeacon-secrets \
  --from-literal=COOKIE_SECRET="$(openssl rand -hex 32)" \
  --from-literal=INITIAL_OWNER_EMAIL="you@example.com" \
  --from-literal=INITIAL_OWNER_PASSWORD="a-strong-password" \
  --from-literal=GITHUB_CLIENT_ID="..." \
  --from-literal=GITHUB_CLIENT_SECRET="..." \
  --dry-run=client -o yaml | kubectl apply -f -

# The pod reads the Secret via envFrom; restart to pick up changes:
kubectl -n nodebeacon rollout restart deploy/nodebeacon
```

## Verify

```sh
kubectl -n nodebeacon rollout status deploy/nodebeacon
kubectl -n nodebeacon get pods -o wide
kubectl -n nodebeacon get deploy nodebeacon -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'

# Real data through the NodePort:
curl -s http://10.77.0.1:31003/api/status | jq '.summary, (.nodes[] | {id, status, cpu: .metrics.cpuPercent})'

# Through nginx (Cloudflare header guard requires the CF-Connecting-IP header):
curl -s -H 'CF-Connecting-IP: 127.0.0.1' -H 'Host: monitor.liucf.com' http://10.77.0.1/api/status | jq '.summary'

# Auth and admin guard through the public hostname:
curl -s https://monitor.liucf.com/api/auth/config | jq .
curl -i https://monitor.liucf.com/api/admin/summary
curl -I https://monitor.liucf.com/api/auth/github
```

For `0.8.0`, expected production checks are:

- image: `nodebeacon:0.8.0`
- `/readyz` and `/healthz`: HTTP 200
- `/api/status`: `summary.total == 5` and `summary.online == 5`
- `/api/auth/config`: password and GitHub login both enabled
- unauthenticated `/api/admin/summary`: HTTP 401
- home `/`: native React status page (no iframe) rendering the real 5 nodes;
  header has a working language switcher + theme toggle + `Login` link to `/login`
- `/`, `/login`, `/admin`: language switcher (zh-CN / zh-TW / en) present in
  that order; a fresh browser defaults to English, while a selected language
  re-renders UI text and persists to `localStorage['nb-lang']`
- `/api/nodes`: public node metadata (no `labels` field)
- unauthenticated `/api/nodes/rs1000` and `/api/nodes/rs1000/range?metric=cpu&range=1h`: HTTP 401
- authenticated `/api/nodes/rs1000/range?metric=cpu&range=1h`: `series[0].points` non-empty
- `/nodes/rs1000`: detail page renders header + current metrics; trend charts
  appear after owner sign-in, with a working 1h/4h/24h/7d switch
- `/api/latency`: `probes` lists the blackbox HTTP targets with latency,
  24h success rate and cert expiry; the status page shows the probe panel
- `/metrics` via the public hostname: HTTP 404 (nginx blocks it); via the
  NodePort/cluster: Prometheus text with `nodebeacon_*` metrics
- `pnpm test` (vitest, apps/api): all green before building the image
- `pnpm test:e2e` (Playwright, optional local check): login, admin nav and
  status page flows pass against a dev server started with the e2e env
- `/admin`: Server / Node list is the first screen; the left sidebar is grouped
  into Monitor (Server/Overview/Latency/Activity) and Manage (Settings/
  Notification/Users/Remote Exec/Sessions/Account/Logs/About/Default Theme
  Settings), with Documentation/Home pinned at the bottom; the nodes table is
  dense (52px rows) and the column-visibility popover closes on outside click.
- `/admin/about`: owner-only runtime/about page renders version, delivery,
  Prometheus/cache/auth boundaries, and repo/reference links.
- `/admin/activity`: owner-only persisted audit timeline shows authentication,
  node registry mutations, and session revocations from SQLite.
- `/admin/sessions`: lists active SQLite-backed sessions; revoking one makes its
  previously issued Cookie return HTTP 401 without affecting other sessions.
- `/admin/nodes`: row actions can copy the Prometheus selector, download a YAML
  snippet, edit node display metadata, edit billing metadata, delete nodes, and
  copy selectors for selected rows from the bulk bar. Drag-reorder issues a
  single `PATCH /api/admin/nodes/order` (batch permutation), not per-node
  PATCHes.
- mutating admin request with a foreign `Origin` header: HTTP 403
  (`origin_mismatch`) — verify with
  `curl -X PATCH -H 'Origin: https://evil.example' ...` using a valid session.
- node registry write-back: the pod loads `/data/nodes.yaml` and falls back to
  `/config/nodes.yaml` as a read-only seed — on a fresh install the runtime
  file legitimately does not exist until the first admin edit. After an owner
  edit, verify the PVC copy (and its rolling backups) exist with:
  `kubectl -n nodebeacon exec deploy/nodebeacon -- ls /data/`
  (expect `nodes.yaml` plus `nodes.yaml.bak.1..3` after repeated saves; writes
  are atomic tmp+rename, and a corrupt runtime file degrades to the seed
  instead of failing `/api/status`)
- SQLite state: `/data/nodebeacon.db` exists, `PRAGMA journal_mode` is `wal`,
  and an authenticated session still resolves after `rollout restart`; signing
  out and replaying the old Cookie returns HTTP 401.
- Deployment strategy is `Recreate`, preventing old and new Pods from writing
  the shared SQLite/YAML PVC at the same time.
- `scripts/backup.sh` succeeds from host cron, the archive is visible on the
  configured off-site VPS, and the restore-drill table below records a verified
  recovery before 0.8.0 is considered fully accepted.
- Remote Exec entry points render the NodeBeacon security-boundary notice; this
  app does not expose browser shell or agent command execution.
- `/admin/settings`: read-only appearance section shows browser-local theme
  preference boundaries alongside data/cache/auth/security/release sections.

## SQLite and registry off-site backup

`scripts/backup.sh` uses SQLite's online backup API inside the running Pod,
runs an integrity check, includes `/data/nodes.yaml` when present, creates a
compressed archive on RS1000, and copies it to another host over SSH. The
destination must be a genuinely separate VPS or storage account; another path
on RS1000 does not count as off-site backup.

First run it interactively and confirm the archive exists on the remote host:

```sh
sudo install -d -m 0750 -o "$USER" /var/backups/nodebeacon
export NODEBEACON_BACKUP_REMOTE='backup@OTHER_VPS:/srv/backups/nodebeacon/'
export NODEBEACON_BACKUP_IDENTITY='/root/.ssh/id_ed25519_nodebeacon_backup'
/usr/bin/env bash ./scripts/backup.sh
ssh backup@OTHER_VPS 'ls -lh /srv/backups/nodebeacon/'
```

Then install the nightly host cron entry. Use a dedicated SSH key restricted to
the remote backup account/path and keep the cron environment outside git:

```cron
17 3 * * * NODEBEACON_BACKUP_REMOTE='backup@OTHER_VPS:/srv/backups/nodebeacon/' NODEBEACON_BACKUP_IDENTITY='/root/.ssh/id_ed25519_nodebeacon_backup' /usr/bin/env bash /path/to/NodeBeacon/scripts/backup.sh >>/var/log/nodebeacon-backup.log 2>&1
```

The script keeps seven days of local archives by default. Remote retention is
owned by the destination host and should be configured independently.

## Restore drill

Always test with a copied archive first. The application must be scaled to zero
before replacing either SQLite or YAML so no writer overlaps the restore pod.

```sh
mkdir -p /tmp/nodebeacon-restore
tar -xzf nodebeacon-YYYYMMDDTHHMMSSZ.tar.gz -C /tmp/nodebeacon-restore

kubectl -n nodebeacon scale deploy/nodebeacon --replicas=0
kubectl apply -f infra/k8s/restore-pod.example.yaml
kubectl -n nodebeacon wait --for=condition=Ready pod/nodebeacon-restore --timeout=60s

kubectl -n nodebeacon cp /tmp/nodebeacon-restore/nodebeacon.db \
  nodebeacon-restore:/data/nodebeacon.db.restore
kubectl -n nodebeacon exec nodebeacon-restore -- \
  node apps/api/dist/cli/backupDatabase.js \
  /data/nodebeacon.db.restore /data/nodebeacon.verify.db
kubectl -n nodebeacon exec nodebeacon-restore -- rm -f /data/nodebeacon.verify.db

# Install the verified snapshot and discard stale WAL sidecars.
kubectl -n nodebeacon exec nodebeacon-restore -- sh -c \
  'rm -f /data/nodebeacon.db-wal /data/nodebeacon.db-shm && mv /data/nodebeacon.db.restore /data/nodebeacon.db'

if test -f /tmp/nodebeacon-restore/nodes.yaml; then
  kubectl -n nodebeacon cp /tmp/nodebeacon-restore/nodes.yaml \
    nodebeacon-restore:/data/nodes.yaml.restore
  kubectl -n nodebeacon exec nodebeacon-restore -- mv \
    /data/nodes.yaml.restore /data/nodes.yaml
fi

kubectl -n nodebeacon delete pod/nodebeacon-restore
kubectl -n nodebeacon scale deploy/nodebeacon --replicas=1
kubectl -n nodebeacon rollout status deploy/nodebeacon --timeout=180s
curl -fsS http://10.77.0.1:31003/readyz
```

After each drill, record the date, archive name, SQLite integrity result,
restored node count, session/audit spot check, and operator here. Do not mark a
production rehearsal successful until all checks have run against the restored
PVC.

| Date (UTC) | Archive | Result | Notes |
| --- | --- | --- | --- |
| 2026-07-10 | `nodebeacon-20260710T173936Z.tar.gz` | Passed | Restored from the real netcup archive into an isolated RS1000 container; SQLite online backup integrity passed and `/api/status` returned 5/5 nodes online |

## Roll back

```sh
kubectl -n nodebeacon rollout undo deploy/nodebeacon
# or drop the whole stack:
kubectl delete -k infra/k8s
```

## Update to a new build

Bump `version` in the root `package.json` and the image tag in
`k8s/deployment.yaml` (the only two per-release edits), commit, sync the tree
to RS1000, then:

```sh
./scripts/deploy.sh
```

## Build notes

- Do not let host `*.tsbuildinfo` files enter the image build context. They can
  make TypeScript believe `packages/shared` is already built and skip emitting
  `packages/shared/dist/index.js`, which crashes the API with
  `ERR_MODULE_NOT_FOUND`.
- The Dockerfile deletes any stray `*.tsbuildinfo` before `pnpm build`, and
  `.dockerignore` excludes `**/*.tsbuildinfo`.
- Keep the built workspace in the runtime image unless a production prune step
  is proven not to remove workspace `dist/` outputs.
