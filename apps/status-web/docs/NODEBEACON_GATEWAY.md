# NodeBeacon Gateway Contract

`src/lib/nodebeacon.ts` 是 Komari 展示模型与 NodeBeacon 公共契约之间唯一的首页映射层。

| Komari 展示字段 | NodeBeacon 来源 |
| --- | --- |
| `uuid`, name, group, region, tags | `/api/status` 的公开注册表字段 |
| online | `online` |
| CPU | `metrics.cpuPercent` |
| RAM | `memoryUsedBytes` / `memoryTotalBytes` |
| Disk | `diskUsedBytes` / `diskTotalBytes` |
| Network up/down | Tx/Rx bytes per second |
| Total up/down | Tx/Rx bytes since boot |
| Uptime | `uptimeSeconds` |

价格、到期时间、IP、Swap、GPU、连接数和进程数不从私有字段推导。没有公开真实值时，
映射层提供零值，使现有展示组件隐藏相应能力。

首页轮询间隔固定为 20 秒。节点名称链到 `getNodeDetailPath(id)`（`/nodes/:id`）。
本仓已提供同一 React 19 壳内的节点详情页，数据只来自 `/api/status`、
`/api/public/nodes/:id/detail` 和白名单
`/api/public/nodes/:id/series`。产品仓库从 v1.1.9 起由 Fastify 把 `/nodes/:id`
交给本页；本仓单独提交仍不部署生产。序列接口失败时详情页仍渲染，图表为空。
延迟序列使用 `/api/public/nodes/:id/series?metrics=latency`，统计使用
`/api/public/nodes/:id/latency-stats?vantage=`，只传白名单 vantage，不传 PromQL
或 labels。实时范围每 5 秒刷新详情和序列，其它范围每 20 秒刷新。

## Calibrated cycle traffic

The optional public `traffic` summary maps to `network.cycle`. Cards, table and
details display the configured billing period, quota, directions, remainder,
source and timestamps. Since-boot counters remain separate. Owners explicitly
opt into publishing this allowance summary through the node editor; raw registry
calibration, billing price, private notes and labels remain owner-only.

Only `status: ok` displays numeric usage. `unavailable` and `needs_calibration`
show an explanation, never zero or since-boot values presented as monthly usage.
`calibrated_estimate` is a manually observed provider baseline plus server-side
measured increments; it must not be described as official provider synchronization.
The API accepts GB or GiB and sum/max/tx/rx accounting, explicit period and
observation times. An unverified period end is shown as an expected reset.
There is no provider login, cookie storage or reset operation in this UI.
