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

## 当前状态（2026-07-26）

- 软件探针 1016690 已激活并连接 RIPE Atlas。
- 五台 NodeBeacon 目标均已验证可响应来自外部节点的 ICMP。
- 一次性创建脚本、服务端结果采集器、Prometheus 指标、节点详情标签、
  Kubernetes 可选挂载及自动化测试已经完成。
- 账户积分到账后，五个 300 秒周期的公开 ICMP 测量已创建成功：
  `193845936` 至 `193845940`，分别对应五个 NodeBeacon 节点。
- 非敏感 measurement artifact 已生成；API UUID 和目标公网地址未写入文件。
- `nodebeacon-ripe-atlas` ConfigMap 已纳入 v1.0.14 发布，采集器同时兼容 RIPE
  `latest` 接口在生产中出现的数组响应和文档所述的 probe-ID 键控对象响应。
- 生产验收结果记录在 `docs/releases/v1.0.14.md`。

## 积分预算

计划参数：

- 目标：5 个 NodeBeacon 节点
- 来源：4 个 RIPE Atlas 探针
- 周期：300 秒
- 每次 ping：3 个包，即 3 credits/result

每日预算：

```text
5 × 4 × (86400 ÷ 300) × 3 = 17,280 credits/day
```

探针主机在线时每分钟获得 15 credits，完整 24 小时约 21,600 credits。
创建前必须在 RIPE Atlas 的 `My Credits / Manage Credits` 中确认余额至少为
`17,280`。RIPE 每天批量入账一次，不应依赖某个固定北京时间，以网页余额为准。

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
