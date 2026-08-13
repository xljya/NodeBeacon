# NodeBeacon Web repository instructions

本文件适用于整个仓库。开始任何任务时，第一步必须完整阅读 `README.md`，先确认 fork
来历、三仓库职责、当前路由与单向交付链路；第二步阅读本文件，第三步阅读
`docs/NODEBEACON_GATEWAY.md`。本仓库是 Komari Web fork 的 NodeBeacon 前端产品源，不是
独立部署仓库，不能仅凭本仓源码或构建结果声称生产已经更新。

`xljya/NodeBeacon` 是唯一主要项目和部署单元；本仓只是为它提供 React 19 源码的辅助仓库。
本仓没有作为独立应用部署到用户的任何机器、服务器、Kubernetes 或域名。源码被 vendored
进 NodeBeacon 镜像不等于本仓被部署；不得把本仓描述成与 NodeBeacon 并列的线上服务。

## 仓库职责与分支

- `nodebeacon` 是 NodeBeacon 使用和提交的唯一产品分支；开始修改前先切换该分支并执行
  `git fetch`，提交或推送前再次确认未落后于 `origin/nodebeacon`。
- `radix` 保留 fork 的 Komari Web 上游历史，`upstream/radix` 用于跟踪原项目。除非用户
  明确要求上游同步，不要直接开发、重写或强推这两个分支。
- `xljya/NodeBeacon` 是产品、后端、发布和生产部署仓库。本仓库不直接部署
  `monitor.liucf.com`，也不维护 Fastify、Prometheus、SQLite 或 Kubernetes 配置。
- `xljya/NodeBeacon1` 仅保留迁移前历史，不是本前端的 API 或发布来源。
- 不输出或提交 Secret、Cookie、Owner 凭据、OAuth 凭据、节点私有字段或生产响应数据。

## 代码与路由边界

- `src/pages/Index.tsx` 及相关组件负责公共状态页；公开数据映射集中在
  `src/lib/nodebeacon.ts`，数据只来自 NodeBeacon 的白名单公共 API。
- `src/pages/nb-admin/` 是适配 NodeBeacon REST 契约的 Owner 页面；通用请求、错误和鉴权
  行为集中在 `src/lib/adminGateway.ts`，正式/影子路径转换集中在
  `src/lib/adminPaths.ts`。不要在页面中另造第二套 Gateway 或路径规则。
- 当前产品声明正式 `/login`、`/admin/*`，并将 `/login-v2`、`/admin-v2/*` 旧影子入口
  重定向到正式路径；是否真正由该壳提供生产 HTML 仍由产品仓库 Fastify 路由和已发布提交
  决定。不要仅凭本仓库 routes 宣称切换或发布已经完成。
- `/instance/:id` 只负责转交到产品仓库的 `/nodes/:id` React 18 详情页；除非有单独迁移
  决策，不要在这里恢复 Komari instance/Agent 数据链路。
- 菜单只展示 NodeBeacon 已实现的能力。插件市场、主题 ZIP、pprof、Metric Store 迁移、
  WebSSH、xterm、Agent 管理和任意命令页面不得注册为可达路由。

## API 与安全约束

- 只能调用 NodeBeacon 已文档化的 `/api/status`、`/api/site-config`、`/api/auth/*`、
  `/api/public/nodes/:id/*` 和 `/api/admin/*` REST 契约；不得新增或模拟 `/api/rpc2`、
  `/api/admin/client/*`、`/api/me`、`/api/logout` 或浏览器直连 Prometheus。
- 公共页面不得显示或缓存 Admin 私有 IP、Prometheus labels、客户端版本、私密备注、账单
  或详情配置。Admin 页面必须依赖后端 Owner 校验，不能用前端隐藏代替授权。
- 请求默认使用 same-origin Cookie；`401`、`403`、安全回跳和错误消息统一经 Admin
  Gateway 处理。回跳路径只能是经过校验的站内路径，禁止开放重定向。
- 主题只能使用 NodeBeacon 的 `AppearanceTokensV1` 安全枚举；不接受 CSS、HTML、脚本、
  ZIP、远程资源或其他可执行内容。
- 构建后必须运行 `npm run scan:forbidden`；不要通过混淆字符串、动态拼接或跳过 scanner
  来规避检查。若确需改变禁用列表，必须先在产品仓库完成架构与安全决策。

## 实施与验证

- 保留用户已有改动；开始和结束检查 `git status`，禁止 `git reset --hard`、强推或覆盖
  无关文件。Bug 修复应先建立失败回归，再修复并复跑同一测试。
- 使用本仓库已提交的 `package-lock.json` 和 npm，不要改用 pnpm/yarn，也不要把 React 19
  依赖并入 NodeBeacon 产品仓库的 React 18 workspace。
- 修改后按风险运行，完整门禁为：

```text
npm ci
npm run lint
npm test
npm run build
npm run scan:forbidden
git diff --check
```

- UI 变更至少检查 `1440x1000` 与 `390x844`、light/dark/system、键盘焦点、触摸操作、
  Reduced Motion、可读性、控制台错误和横向溢出。Admin/Login 还要覆盖匿名访问、登录、
  TOTP、登出、Owner-only API、影子/正式路径和安全回跳。
- 新增或修改文案要同步中英文资源并运行 `npm run i18n:sync:dry`；不要只修一个 locale。
- 不修改 `dist/`、缓存、生成报告或其他构建产物来掩盖源代码问题。

## 向产品仓库交付

1. 在 `nodebeacon` 分支完成改动和全部前端门禁。
2. 提交并推送 `NodeBeacon-Web`，记录完整 40 位 commit SHA。
3. 在 `xljya/NodeBeacon` 中从该精确提交更新 `apps/status-web`，并同步更新
   `apps/status-web/NODEBEACON_WEB_COMMIT`；不得手工挑选一部分文件后仍记录完整提交。
4. 在产品仓库运行根门禁、版本发布、RS1000 部署和真实浏览器验收。只有该闭环完成后才
   能声称前端已上线。

本仓库单独的文档或源码提交不触发生产部署，也不应更新产品发布记录。

## 本机命令

- Windows 11 使用 PowerShell 7；本机命令使用 PowerShell cmdlet 和 `;`，不要使用 Bash
  的 `&&`、heredoc、`grep`、`sed`、`awk`、`rm` 或 `find`。
- 搜索优先使用 `rg` / `rg --files`；不可用时使用 `Get-ChildItem`、`Select-String`。
- 保持现有换行符，避免因 CRLF/LF 产生整文件无意义变更。
