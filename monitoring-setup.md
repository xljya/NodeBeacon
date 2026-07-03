# 自托管监控数据接入指南

> 目标:把状态页里的每一项(CPU / 内存 / 磁盘 / 负载 / 网速 / 流量 / 端点可用性 / 响应时间 P50·P95 / 90 天可用性 / incident 时间线)对应到 **真实指标**,并给出所需的采集器与配置。
>
> 数据链路:
>
> ```
> node_exporter    ─┐
> blackbox_exporter ─┼─►  Prometheus  ─►  Alertmanager  ─►  通知(TG/邮件/Webhook)
>                   │         │
>                   │         └────────►  状态页(直接查 Prometheus HTTP API)
> ```
>
> **关键认知:数据都存在 Prometheus 里。** Grafana 只是另一个可视化前端,状态页不需要经过 Grafana —— 直接调用 Prometheus 的 `/api/v1/query` 与 `/api/v1/query_range` 即可。

---

## 0. 组件职责一览

| 组件 | 作用 | 装在哪 |
|---|---|---|
| **node_exporter** | 采集单台主机的 CPU / 内存 / 磁盘 / 负载 / 网卡等 | 每台被监控服务器 |
| **blackbox_exporter** | 从外部探测 URL:是否在线、HTTP 状态码、响应耗时 | 中心机(1 台即可) |
| **Prometheus** | 定时抓取上面两者、存储时序、提供查询 API | 中心机 |
| **Alertmanager** | 接收 Prometheus 告警、去重、通知,并作为 incident 历史来源 | 中心机 |

---

## 1. node_exporter —— 主机指标

### 安装(每台服务器)
```bash
# 下载并运行(或用 systemd / docker)
docker run -d --name node_exporter --net host --pid host \
  -v /:/host:ro,rslave \
  quay.io/prometheus/node-exporter:latest \
  --path.rootfs=/host
# 默认监听 :9100/metrics
```

### 字段对照(状态页字段 → PromQL)

> 下面所有查询里的 `instance` 标签就是每台机器,`job="node"` 见第 3 节抓取配置。

| 状态页字段 | PromQL | 说明 |
|---|---|---|
| **CPU %** | `100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)` | 1 减去 idle 占比 |
| **CPU 近 1h 趋势** | 同上,用 `query_range`,`step=5m`,`start=now-1h` | sparkline |
| **内存 用量 / 总量** | 已用 = `node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes`;总量 = `node_memory_MemTotal_bytes` | 占比 = 两者相除 ×100 |
| **磁盘 / 用量 / 总量** | 已用 = `node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_avail_bytes{mountpoint="/"}`;总量 = `node_filesystem_size_bytes{mountpoint="/"}` | 按需换 mountpoint |
| **Uptime** | `node_time_seconds - node_boot_time_seconds` | 秒,前端格式化成 `87d 14h` |
| **Load 1m** | `node_load1` | 直接取 |
| **实时网速 ↑ / ↓** | ↓ `rate(node_network_receive_bytes_total{device!~"lo|docker.*"}[1m])`;↑ `rate(node_network_transmit_bytes_total{...}[1m])` | 字节/秒,前端 ÷1e6 → MB/s |
| **累计流量 ↑ / ↓** | `increase(node_network_transmit_bytes_total[30d])` / `..receive..` | 需要保留期覆盖统计窗口 |

> 分组用的 **provider / region / 国旗** 不是查出来的,是你在抓取配置里给每个 target 打的 label(见第 3 节 `labels:`)。前端读 label 决定分组与旗帜。

---

## 2. blackbox_exporter —— 端点探测

### 安装(中心机 1 台)
```bash
docker run -d --name blackbox --net host \
  -v $(pwd)/blackbox.yml:/config/blackbox.yml \
  quay.io/prometheus/blackbox-exporter:latest \
  --config.file=/config/blackbox.yml
# 默认监听 :9115
```

### blackbox.yml(HTTP 探测模块)
```yaml
modules:
  http_2xx:
    prober: http
    timeout: 8s
    http:
      valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
      valid_status_codes: []          # 空 = 2xx 视为成功
      method: GET
      follow_redirects: true
      preferred_ip_protocol: ip4
```

### 字段对照

| 状态页字段 | PromQL | 说明 |
|---|---|---|
| **Online / Offline** | `probe_success` (1/0) | 探测成功与否 |
| **HTTP 状态码** | `probe_http_status_code` | 200 / 503 … |
| **最新响应时间** | `probe_duration_seconds` | 秒,前端 ×1000 → ms |
| **响应时间趋势** | 上者用 `query_range` | 折线 |
| **P50 / P95** | `quantile_over_time(0.5, probe_duration_seconds{instance="https://grafana.liucf.com"}[1h])`;P95 把 0.5 换 0.95 | 用一段窗口的分位数 |

> 说明:blackbox 每次探测产出一个"当前值",分位数是在 **一段时间窗口** 上算的(`quantile_over_time`),窗口越长越平滑。

---

## 3. Prometheus —— 抓取 / 存储 / 查询

### prometheus.yml
```yaml
global:
  scrape_interval: 15s          # 与"每 30s 刷新"匹配,可调
  evaluation_interval: 30s

rule_files:
  - /etc/prometheus/rules/*.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ["localhost:9093"]

scrape_configs:
  # ---- 主机指标 ----
  - job_name: node
    static_configs:
      - targets: ["1.2.3.4:9100"]
        labels: { instance: dmit-uswest, provider: DMIT,   region: "US West · San Jose", flag: "🇺🇸" }
      - targets: ["5.6.7.8:9100"]
        labels: { instance: hostbrr-4t,  provider: HostBrr, region: "EU · Frankfurt",     flag: "🇩🇪" }
      - targets: ["9.9.9.9:9100"]
        labels: { instance: huawei-2c1g, provider: "Huawei Cloud", region: "CN · 上海",   flag: "🇨🇳" }
      # ... netcup-1o / RS1000 同理,provider: Netcup

  # ---- 端点探测(经 blackbox)----
  - job_name: blackbox_http
    metrics_path: /probe
    params: { module: [http_2xx] }
    static_configs:
      - targets:
          - https://grafana.liucf.com
          - https://monitor.liucf.com
          - https://prometheus.liucf.com
          - https://sre-demo.liucf.com
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: 127.0.0.1:9115      # blackbox 地址
```

### 90 天可用性色块 —— 需要额外配置(重点)

Prometheus 默认只保留 **15 天**,90 天色块条要做两件事之一:

**方案 A:直接拉长保留期**
```bash
--storage.tsdb.retention.time=120d
```

**方案 B(推荐):每天聚合一次可用率,存一条小指标**
`rules/uptime.yml`:
```yaml
groups:
  - name: daily-uptime
    interval: 1h
    rules:
      # 每台/每端点最近 1 天的成功率(0~1)
      - record: sla:probe_success:ratio_1d
        expr: avg_over_time(probe_success[1d])
      - record: sla:node_up:ratio_1d
        expr: avg_over_time(up{job="node"}[1d])
```
前端按天查 `sla:probe_success:ratio_1d`:≥0.999 绿、≥0.99 黄、否则红。方案 B 存储开销极小,能轻松留 90+ 天。

---

## 4. Alertmanager —— 阈值告警 + incident 历史来源

incident 时间线("何时宕机、持续多久")Prometheus 本身不存事件,由 **告警规则 + Alertmanager** 产出。

### 告警规则 `rules/alerts.yml`
```yaml
groups:
  - name: infra
    rules:
      - alert: EndpointDown
        expr: probe_success == 0
        for: 1m
        labels: { severity: critical }
        annotations:
          summary: "{{ $labels.instance }} 无法访问"

      - alert: HighCPU
        expr: 100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m]))*100) > 90
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "{{ $labels.instance }} CPU 持续 >90%"

      - alert: HighMemory
        expr: (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > 90
        for: 5m
        labels: { severity: warning }

      - alert: DiskAlmostFull
        expr: (1 - node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100 > 90
        for: 10m
        labels: { severity: critical }
```
> 阈值和状态页配色一致:80% 黄、90% 红。80% 的"黄"可再加一条 `> 80` 的 warning。

### alertmanager.yml(示例:Telegram)
```yaml
route:
  receiver: tg
  group_by: [alertname, instance]
  repeat_interval: 3h
receivers:
  - name: tg
    telegram_configs:
      - bot_token: "<BOT_TOKEN>"
        chat_id: <CHAT_ID>
        parse_mode: HTML
```

### incident 时间线怎么取
- **实时"进行中"**:查 `ALERTS{alertstate="firing"}`(Prometheus 内建,只要有 firing 告警就有这条)。
- **历史记录 + 持续时长**:让 Alertmanager 把 resolved 事件推到一个 webhook,落库(SQLite/PG),字段 `alertname / instance / startsAt / endsAt / severity`。前端读这张表算 `endsAt - startsAt = 持续时长`。这是唯一需要一点点后端存储的部分。

---

## 5. 状态页如何取数(前端接线)

状态页不查 Grafana,直接打 Prometheus:

```
# 即时值(卡片当前数字)
GET https://prometheus.liucf.com/api/v1/query?query=<PromQL>

# 区间值(sparkline / 趋势 / 90 天)
GET .../api/v1/query_range?query=<PromQL>&start=<ts>&end=<ts>&step=<秒>
```

前端每 30s 轮询即时值,趋势图用 `query_range`。**注意跨域**:要么给 Prometheus 加反向代理注入 CORS 头,要么在状态页自己的后端做一层转发(顺便隐藏 Prometheus 不对外)。

---

## 6. 落地清单

- [ ] 每台机装 node_exporter(:9100)
- [ ] 中心机装 blackbox_exporter(:9115)+ `http_2xx` 模块
- [ ] Prometheus 抓取 node + blackbox,给每台 target 打好 `provider/region/flag` label
- [ ] 加 recording rule `sla:*:ratio_1d`,保留期 ≥ 90d(方案 B)
- [ ] 加告警规则(CPU/内存/磁盘/端点),接 Alertmanager
- [ ] Alertmanager resolved webhook 落库,供 incident 时间线读取
- [ ] 状态页对接 Prometheus `query` / `query_range`,处理 CORS

### 数据来源可靠性小结
- **直接真数据(node/blackbox 标准指标)**:CPU、内存、磁盘、负载、Uptime、网速、流量、Online/离线、HTTP 码、响应时间、P50/P95、实时 incident —— 全部一一对应,不会是假的。
- **需额外配置**:90 天历史(recording rule + 保留期)、incident 历史时间线(Alertmanager webhook 落库)。这两处配置好后同样是真数据。
