# RIPE Atlas 四视角延迟接入手册

## 目标

节点详情页的 `Latency` 图表展示四条真实 ICMP RTT 序列：

| 标签 | RIPE Atlas 探针 | 网络视角 |
| --- | ---: | --- |
| Ping | 1016690 | NodeBeacon 自有华为云软件探针，上海，AS55990 |
| 浙江移动 | 1009298 | 浙江移动，AS56041 |
| 浙江联通 | 1009966 | 浙江联通，AS4837 |
| 浙江电信 | 55328 | 浙江电信，AS4134 |

每条序列均来自 RIPE Atlas 测量结果，不由浏览器伪造。`huawei-2c1g`
同时是 NodeBeacon 的被监控服务器和 RIPE Atlas 探针主机，但不是 k3s
工作节点；当前生产 k3s 仍只有 `rs1000`。RIPE Atlas 探针直接作为
`ripe-atlas.service` 运行在华为云主机上，不需要额外 Kubernetes Pod。

## 当前状态（2026-08-23）

- 软件探针 1016690 已激活并连接 RIPE Atlas。
- 账户里目前只有五条 NodeBeacon 用户定义测量；没有其它进行中的 UDM。
- 2026-08-23 已将周期从 300 秒重建为 900 秒。新公开测量 ID 为
  `203481343` 至 `203481347`，分别对应五个 NodeBeacon 节点。旧 ID
  `193845936`–`193845940` 已停止。
- RIPE 账户当前预估支出 `5,760 credits/day`，预估入账约 `33,619 credits/day`，
  不会按此速率耗尽。邮件里 48 小时约 20 万 credits 是过去窗口的峰值，不是当前
  进行中的 UDM 集合。
- 运行时采集仍只读公开 `latest`，不保存 API UUID。
- 生产 ConfigMap 与测量 ID 必须一起发布，否则节点详情会继续读已停止的旧 ID。

## 积分预算

计划参数：

- 目标：5 个 NodeBeacon 节点
- 来源：4 个 RIPE Atlas 探针
- 周期：900 秒（15 分钟）
- 每次 ping：3 个包，即 3 credits/result

每日预算：

```text
5 × 4 × (86400 ÷ 900) × 3 = 5,760 credits/day
```

旧的 300 秒周期是 `17,280 credits/day`，约占单软件探针入账 `21,600/day` 的 80%，余量过窄。
公开 API 只能看到打了 `nodebeacon` 标签的五条测量；账户里若还有未打标签或私有 UDM，
实际消耗会远高于这份预算。RIPE 在预计 5 天内耗尽时会发邮件，耗尽后会停掉最贵的测量。

探针主机在线时每分钟获得 15 credits，完整 24 小时约 21,600 credits。
900 秒方案约占入账的 27%。创建或替换前在 `My Credits / Manage Credits` 核对余额。
RIPE 每天批量入账一次，不应依赖某个固定北京时间，以网页余额为准。

调整进行中的测量时必须先停后建：RIPE 不允许 PATCH 改 `interval`。使用：

```powershell
pwsh -NoProfile -File .\scripts\replace-ripe-atlas-measurements.ps1 -Force
```

API UUID 从环境变量 `RIPE_ATLAS_API_KEY` 读取，或交互隐藏输入；需要 Stop 与
Schedule 权限。脚本通过 `/api/v2/measurements/my/` 列出账户自己的测量（不要用
会混入全球内置测量的 `mine=true`），先停掉非当前 NodeBeacon 集合的进行中 UDM，
再创建 900 秒新五条，最后停掉旧 ID。成功后把 gitignored artifact 写进
`infra/k8s/configmap-ripe-atlas.yaml` 并发布，否则页面仍读旧 ID。
不要把 UUID 粘贴到 issue、提交记录或聊天中。

## 创建测量

在仓库根目录执行：

```powershell
pwsh -NoProfile -File .\scripts\setup-ripe-atlas-measurements.ps1
```

脚本会先执行只读预检：

1. 通过 RIPE Atlas 公共 API 验证四个探针仍为 `Connected`、公开且 ASN 未变。
2. 从本机 SSH 配置解析五台服务器的公网 IPv4；地址不会打印或写入 artifact。
3. 显示节点数、探针数、周期和每日积分预算。
4. 只有准确输入 `CREATE` 后才继续。
5. API UUID 使用隐藏输入，只存在于进程内存，不写入磁盘。

API key 只需要 `Schedule a new measurement` 权限。成功后脚本把非敏感映射写入：

```text
artifacts/ripe-atlas/measurements.json
```

该目录已被 `.gitignore` 排除。文件只包含 measurement ID、节点 ID 和公开探针
元数据，不包含 API key 或目标公网地址。文件存在时脚本会拒绝重复创建。

如果仍提示积分不足，保持探针在线，等待下一次日结后重试。不要创建第二套 API
key，也不要把 UUID 粘贴到 issue、提交记录或聊天中。

## 成功后的仓库与生产续接

测量创建成功后：

1. 检查 artifact 数量为 5，且没有 API key 或目标地址。
2. 由 artifact 生成 `nodebeacon-ripe-atlas` ConfigMap；只提交公开 measurement
   ID 和探针元数据。
3. 把 ConfigMap 加入 `infra/k8s/kustomization.yaml`。
4. 同步版本号、Deployment、restore Pod 和发布文档。
5. 重新执行 `lint`、`typecheck`、单元测试、构建和 Chromium Playwright。
6. 按 `infra/README.md` 执行部署预检、不可变镜像发布和生产验收。

运行时 NodeBeacon 不保存或使用 RIPE API key。服务端每分钟读取公开的
`/api/v2/measurements/{id}/latest/` 结果并导出：

```text
nodebeacon_ripe_atlas_rtt_milliseconds
nodebeacon_ripe_atlas_probe_success
nodebeacon_ripe_atlas_result_timestamp_seconds
nodebeacon_ripe_atlas_collection_requests_total
nodebeacon_ripe_atlas_collection_duration_seconds
nodebeacon_ripe_atlas_last_collection_success_timestamp_seconds
```

浏览器仍只访问 NodeBeacon BFF，既不直接查询 RIPE Atlas，也不直接查询
Prometheus。旧 RS1000 WireGuard TCP 延迟仅在某个节点尚无 RIPE Atlas 序列时
作为过渡兜底；只要 RIPE Atlas 已产生真实序列，页面就只展示四个 RIPE 标签。

## 更新频率与 RS1000 k3s 监控的区别

生产环境存在多层不同频率，不能把浏览器刷新频率当成底层采样频率：

| 层级 | 频率 | 实际含义 |
| --- | ---: | --- |
| 节点详情当前指标、实时图表请求 | 5 秒 | 页面可见时向 NodeBeacon BFF 请求；不是让 RIPE 重新测量。 |
| 全局状态摘要 | 20 秒 | 更新节点在线状态和列表摘要。 |
| 事故记录 | 60 秒 | 更新最近 firing/resolved 事件。 |
| `node-detail-fast` | 5 秒 | RS1000 上的 Prometheus 通过 WireGuard 或本机 Service 抓取五台服务器的 `node_exporter`。 |
| RIPE Atlas 测量 | 900 秒 | 四个探针分别向五个公开目标执行 3 包 ICMP；这是延迟真实样本的产生频率。 |
| RIPE Atlas collector | 60 秒 | NodeBeacon 服务端读取公开 `latest` 结果并导出 Prometheus gauge。 |
| RIPE Atlas 官方 `latest` 缓存 | 最多 5 分钟 | RIPE API 的结果可能晚于测量发生时间返回；NodeBeacon 以结果时间戳判断新鲜度。 |

RS1000 k3s 监控回答的是“服务器此刻的资源和连接状态”：数据由服务器自己的
`node_exporter` 直接产生，Prometheus 5 秒抓取一次。RIPE Atlas 回答的是“从某个
外部网络视角到服务器的公网路径质量”：数据由华为云、浙江移动、浙江联通和浙江电信
四个独立探针产生，和 RS1000 是否为 k3s 工作节点无关。两者不能互相替代。

`huawei-2c1g` 只是同时承担了被监控服务器与 `Ping` 软件探针两个角色；软件探针作为
systemd 服务连接 RIPE Atlas，不需要加入 RS1000 k3s，也不需要为它增加 Pod。

## 信息图标的真实统计口径

延迟标签的信息图标按需调用：

```text
GET /api/public/nodes/:id/latency-stats?vantage=<key>
```

NodeBeacon 服务端从对应公开 measurement 与 probe 读取最近 24 小时原始 `results`
接口，结果缓存 5 分钟。API UUID 不参与运行时查询；浏览器不会收到目标 IP、探针源 IP
或 Prometheus 查询能力。

- 丢包：`1 - 收到的包数 / 发送的包数`。
- 最小值、最大值、平均值、P50、P99、标准差：按原始成功 ICMP 包的 RTT 计算。
- 最新：最近一次有成功回包的测量平均 RTT。
- 波动：相邻两次有效测量平均 RTT 的绝对差均值。
- 样本数量：最近 24 小时实际测量执行次数，不是页面请求次数或 Prometheus 抓取次数。
- 有效样本：至少有一个有效 RTT、可计算平均值的测量次数。
- 包数：真实收到/发送的 ICMP 包数；类型固定显示 `ICMP`，检测间隔来自配置的
  `900s`，不会照抄参考页面的 `TCP / 60s`。

统计接口只在用户展开面板时请求。页面关闭或信息图标未展开时，不会为四个标签持续
下载 24 小时原始数据。

## 验收

生产启用后至少验证：

- 五个节点的 Latency 卡片均出现 `Ping / 浙江移动 / 浙江联通 / 浙江电信`。
- 标签 Tooltip 显示城市、运营商、ASN 和 Probe ID。
- Prometheus 中每个 `node_id` 有四条新鲜 RTT 序列。
- 无回复或过期结果不保留旧 RTT，页面不会把陈旧数据当作实时数据。
- NodeBeacon 日志没有持续的 RIPE Atlas collection failure。
- 公网 API、页面源码和 Kubernetes 对象均不包含 API UUID。

官方参考：

- [RIPE Atlas Credits](https://atlas.ripe.net/docs/getting-started/credits/)
- [Creating Measurements](https://atlas.ripe.net/docs/apis/rest-api-manual/measurements/creating-measurements/)
- [Results and Latest](https://atlas.ripe.net/docs/apis/rest-api-manual/measurements/results-and-latest/)
- [Measurement Result Format](https://atlas.ripe.net/docs/apis/measurement-result-format/)
