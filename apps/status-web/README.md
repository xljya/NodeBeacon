# NodeBeacon Web Shell

NodeBeacon 的访客状态页前端。这个分支保留 Komari Web 的组件、布局、响应式和主题外壳，
但运行时数据只来自 NodeBeacon Fastify BFF，不依赖 Komari Server、Agent、RPC2、WebSocket、
Metric Store、插件或 WebSSH。

## 仓库关系

- 产品与发布仓库：`xljya/NodeBeacon`
- 基础设施源仓库：`xljya/NodeBeacon1`
- 本仓库 `nodebeacon`：NodeBeacon 使用的前端产品分支
- 本仓库 `radix`：保留的 Komari Web fork 上游分支
- `upstream/radix`：`komari-monitor/komari-web` 的跟踪分支

当前产品分支起点为上游提交 `d859bcdd6dafb712baa0958cbc4dfa208e1013d7`。
上游仓库当前没有展示许可证；保留来源说明不代表替代许可证授权判断。

## 数据边界

- `/api/status`：节点列表与约 20 秒的公开状态快照
- `/api/site-config`：站点名称与白名单主题 token
- `/api/auth/*`：登录、二次验证和当前账户
- `/api/public/nodes/:id/series`：服务端白名单 Prometheus 趋势查询
- `/nodes/:id`、`/login`、`/admin`：由 NodeBeacon 产品仓库中的现有应用处理

前端不得请求 `/api/rpc2`，不得直接请求 Prometheus，也不得显示 API 没有公开的 IP、
labels、账单、私密备注或客户端版本。

## 本地开发

需要 Node.js 22（最低兼容 Node.js 20.19）。

```text
npm ci
npm run dev
npm run lint
npm run build
```

开发代理通过 `.env.development` 中的 `VITE_API_TARGET` 指向 NodeBeacon API。
