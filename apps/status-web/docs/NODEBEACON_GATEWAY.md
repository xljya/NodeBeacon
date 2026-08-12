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

首页轮询间隔固定为 20 秒。延迟弹层使用
`/api/public/nodes/:id/series?metrics=latency`，只传 API 允许的枚举，不传 PromQL 或 labels。
