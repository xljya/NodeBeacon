# NodeBeacon repository instructions

本文件适用于整个仓库。开始任何任务时，第一步必须完整阅读根目录 `README.md`，先确认
项目作用、来历、三仓库职责和交付方向；第二步再阅读本文件的执行约束。进入子目录后，若
存在更深层的 `AGENTS.md`，同时遵守更具体的说明。不要跳过 README 后仅凭目录名或旧经验
判断本仓库与 `NodeBeacon-Web`、`NodeBeacon1` 的关系。

## 工作原则

- 不要只根据用户截图或一句描述直接改代码。先确认任务涉及的应用、文档、基础设施和
  发布边界，再实施。
- 用户提到 `monitor.liucf.com`、线上页面、生产问题、发布或部署时，默认目标是完成
  “修改、验证、发布、生产验收、记录”的完整闭环；除非用户明确说只需本地修改、只做
  分析或不要部署。不要在本地测试通过后就停止。
- 对只读分析、代码审查、解释类任务，不要擅自修改、提交或部署。
- 在安全且范围明确时自行推进，不要等待用户反复提醒查看文档、运行测试、更新进度或
  执行发布。只有缺少会显著改变结果的选择、权限或密钥时才询问用户。
- 保留用户已有改动。开始和结束时检查 `git status`，不要覆盖无关修改，不要使用
  `git reset --hard`、强制推送或其他破坏性 Git 操作。
- 开始新增功能或修改代码前，先执行 `git fetch` 检查当前分支的远端进度；若远端存在
  新提交，必须在保留本地改动的前提下先完成拉取、合并、冲突处理和必要验证，确认本地
  基线已与协作者同步后再继续开发。提交或推送前再次检查远端，禁止跳过同步、覆盖他人
  提交或使用强制推送。
- 这是个人项目，默认直接以 `main` 作为唯一开发与同步分支：开始任务时切换到
  `main` 并与 `origin/main` 同步，不要自动创建 `codex/*`、`agent/*` 或其他功能
  分支。只有用户明确要求隔离开发、PR 或专用分支时才能新建分支。该规则适用于本产品
  仓库；配套前端仓库 `NodeBeacon-Web` 的产品分支固定为 `nodebeacon`。
- 不输出 Secret、Cookie、OAuth 凭据、备份密钥、数据库内容或其他敏感信息。

## 项目结构

- `apps/status-web`: 从 `NodeBeacon-Web` 固定提交引入的 Komari Web/React 19 源码；负责
  公共状态页以及正式 `/login`、`/admin` Owner 界面，使用独立 npm lock。
- `apps/web`: NodeBeacon React 18 壳；当前负责节点详情，旧 Admin/Login 代码等待后续清理，
  构建后静态资源装配到 `/legacy/assets`。
- `apps/api`: Fastify API、认证、Prometheus 查询、SQLite 和节点注册表逻辑。
- `packages/shared`: Web 与 API 共用的类型和契约。
- `e2e`: Playwright 浏览器测试。
- `docs`: 架构决策、实现计划、API 说明、故障处理和发布验收记录。
- `infra`: RS1000 k3s、Prometheus、Cloudflare、nginx 和生产运维说明。
- `scripts`: 部署、生产验收、备份、恢复相关脚本。
- `config`: 本地或种子配置；生产运行时状态位于 PVC，不应从本地文件臆测。

## 三仓库与前端同步边界

- `xljya/NodeBeacon`（本仓库）是产品、发布和生产部署的唯一来源。
- `xljya/NodeBeacon-Web` 是 Komari Web fork 的可维护前端源；产品改动在 `nodebeacon`
  分支进行。涉及 `apps/status-web` 的功能修改时，必须先在该仓库实现、验证、提交并推送，
  再把该精确提交引入本仓库，同时更新 `apps/status-web/NODEBEACON_WEB_COMMIT`。不要只改
  vendored 副本而让两个仓库永久分叉。`NodeBeacon-Web` 本身不发布生产；只有本仓库完成
  固定提交引入、根门禁、版本发布和 RS1000 验收后，前端改动才算交付。
- `xljya/NodeBeacon1` 仅保留迁移前的 NodeBeacon/infra 历史，不参与当前产品构建或生产
  数据面；除非用户明确要求，不要向该仓库回写当前功能。
- `apps/status-web` 被排除在 pnpm workspace 外，必须使用其 `package-lock.json` 和 npm；
  不要把 React 19/Radix 依赖并入 React 18 workspace，也不要用根 pnpm lock 替代其 lock。
- 当前路由分阶段迁移：`/`、`/instance/*`、`/login` 与 `/admin/*` 使用 Komari-derived
  壳，`/login-v2` 与 `/admin-v2/*` 重定向到正式路径，`/nodes/*` 仍使用 React 18 壳。
  改变正式路由归属必须有单独发布、浏览器验收和明确回滚路径。
- Komari-derived 前端只能调用 NodeBeacon 的显式 REST 契约。禁止新增或模拟 Komari
  RPC2、Agent 上报、Metric Store、浏览器直连 Prometheus、WebSSH、任意命令、插件市场、
  ZIP/可执行主题等接口；构建产物必须继续通过 forbidden-endpoint scan。

## 文档优先与路由

执行任务前完整阅读与任务直接相关的文档，不要只搜索一个关键词或只读片段：

- 通用开发和项目概览：`README.md`。
- 生产架构、版本发布、验证、备份与回滚：`infra/README.md`。
- 部署实现细节：`scripts/deploy.sh`、`scripts/verify-production.sh`。
- 生产故障：`docs/troubleshooting.md`。
- Cloudflare、缓存或安全响应头：`infra/cloudflare.md` 与
  `infra/nginx/monitor.liucf.com.conf`。
- Prometheus、探针、告警或快采：`infra/monitoring/README.md` 及相关清单。
- 节点详情功能：`docs/node-detail-v2-implementation-plan.md`。
- API 契约：`docs/api/` 与 `packages/shared`。
- 跨平台、换行符和同步：`docs/cross-platform-sync.md` 与 `.gitattributes`。
- 重大架构选择：`docs/adr/`。不得无意中破坏其中的约束，尤其是 RS1000 k3s、
  Fastify BFF、服务端 Prometheus 查询、SQLite-first 和单容器部署。
- Komari Web 来源、双壳路由和安全边界：`docs/adr/0014-komari-web-public-shell.md`；
  当前正式 Admin 切换状态和验收证据：`docs/releases/v1.1.3.md`。
- 发布前查看最近的 `docs/releases/`，沿用现有验收记录格式。

若代码、清单、脚本与文档互相矛盾，先通过只读检查确认生产实际状态；不要静默选择其一。
完成任务时同步修正文档或明确报告差异。

## 本机与远端执行边界

- 执行本机命令前先确认宿主系统和当前 shell，不要假设所有协作者都使用同一平台；
  命令、路径、引号、环境变量和脚本调用必须符合当前环境。
- Windows 11 默认使用 PowerShell 7：使用 PowerShell cmdlet 和语法，不要在本机命令中
  使用 Bash 的 `&&`、heredoc、`grep`、`sed`、`awk`、`rm` 或 `find`。
- macOS 默认使用 `zsh`，Linux 默认使用当前可用的 POSIX shell（通常为 `bash` 或
  `sh`）；可使用对应的 POSIX 语法和工具，不要强行套用 PowerShell cmdlet 或 Windows
  路径格式。
- 搜索文本和文件时各平台都优先使用 `rg` / `rg --files`；若不可用，Windows 使用
  `Get-ChildItem`、`Select-String`，macOS/Linux 使用当前平台的标准只读搜索工具。
- `.ps1` 脚本需要 PowerShell 7（`pwsh`）；`.sh` 脚本在 macOS/Linux 或 SSH 远端使用。
  不要仅为跨平台调用临时改写脚本，先查看 `docs/cross-platform-sync.md` 和脚本自身说明。
- `ssh RS1000 '...'` 的远端命令运行在 Linux，可使用 POSIX/Bash 语法。保持远端命令
  范围明确，并按本机 shell 正确处理外层引号，避免把本地变量或秘密意外展开到输出中。
- 保持 `.gitattributes` 定义的换行符策略，不因 Windows `CRLF`、macOS/Linux `LF`
  差异制造整文件无意义变更；出现差异时按 `docs/cross-platform-sync.md` 排查。
- 生产位于 RS1000 的 `nodebeacon` namespace，流量路径和 NodePort 以
  `infra/README.md` 为准，不要另造部署方式或使用 `latest` 镜像。

## 实施与验证

- 先定位真正负责该行为的源文件；不要修改构建产物、缓存文件或旧原型来掩盖问题。
- Bug 修复必须先复现再修复：
  1. 编写能复现问题的最小回归测试。
  2. 确认该测试在原始代码上失败。
  3. 以最小改动修复根本原因。
  4. 确认同一测试通过。
  5. 运行相关测试和回归测试。
  不得先修改实现，再编写专门迎合新行为的测试。
- UI 变更至少检查桌面与移动响应式行为、明暗主题、文本可读性和交互可用性。涉及线上
  UI 时，发布后必须用真实浏览器访问生产 URL，确认关键元素、计算样式或交互，而不只
  是请求 HTML。
- API 或数据结构变更要同步检查 `packages/shared`、API 路由/服务、Web 消费端、测试和
  API 文档。
- 修改 Komari-derived 页面时同时在 `NodeBeacon-Web` 运行 `npm run lint`、`npm test`
  和 `npm run build`；引入产品仓库后再运行根门禁。上游已有 warning 要如实记录，新增
  error 或 warning 不得静默接受。
- 涉及 Admin/Login 路由时必须分别验证正式与影子入口、匿名重定向、登录后安全回跳、
  Owner-only API、移动端抽屉以及控制台/网络请求；不得因影子页面可用而误判正式路由已切换。
- 基础设施变更先渲染或 dry-run，再应用；生产状态、PVC、Secret、监控栈和备份均按
  `infra/README.md` 的专门流程处理。
- 修改后运行与风险相称的测试。生产发布的标准本地门禁为：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright test --project=chromium
```

- Playwright 需要单独指定一个项目运行。不要使用会同时叠加 `edge` 与 `chromium` 的
  参数组合；测试失败时区分真实回归与测试环境/鉴权状态问题，并以独立干净重跑结果为准。
- 提交前运行 `git diff --check`，检查 diff 和工作树，确认只包含本任务文件。

## 生产发布流程

当任务默认或明确要求发布到 `monitor.liucf.com` 时，严格执行以下顺序：

1. 阅读 `infra/README.md`、`scripts/deploy.sh` 和最近的发布记录。
2. 将 patch 版本同步提升到以下四处，四者必须一致：
   - 根目录 `package.json` 的 `version`；
   - `infra/k8s/deployment.yaml` 的 `nodebeacon:<version>`；
   - `infra/k8s/restore-pod.example.yaml` 的 `nodebeacon:<version>`；
   - `infra/k8s/executor.yaml` 的 `nodebeacon:<version>`。
3. 完成全部本地门禁与 diff 检查。
4. 提交发布代码并推送 `main`；推送前再次同步 `origin/main`，不要强推。
5. 在 RS1000 使用包含 `.git` 的干净检出目录同步该精确提交。优先使用 Git；若 RS1000
   无法访问 GitHub，可用 `git bundle` 传输，但仍须保留可验证的 Git SHA 和干净工作树。
6. 在远端仓库根目录先运行 `./scripts/deploy.sh --plan`，核对版本、完整 SHA、版本镜像和
   `nodebeacon:git-<12-char-sha>` 不可变镜像标签。
7. 计划无误后运行 `./scripts/deploy.sh`。不得绕过脚本手工部署，除非脚本本身故障且已
   明确说明原因和等价步骤。
8. 部署成功后从同一检出运行 `./scripts/verify-production.sh`。
9. 对本次变更执行额外的生产专项检查；UI 变更使用浏览器，API 变更请求真实端点，监控
   变更检查对应 Prometheus/Kubernetes 状态。
10. 验收通过后，将 `/root/deploy/nodebeacon-current` 更新到已验收的发布目录。该链接被
    夜间备份 cron 使用，不能遗留在旧版本。更新前验证目录、Git SHA 和工作树。
11. 在 `docs/releases/v<version>.md` 写入版本、部署 SHA、Deployment revision、测试、
    生产验收、证据路径和回滚方式；将发布记录作为后续文档提交并推送。生产运行 SHA
    仍应指向发布代码提交，而不是仅含文档的后续提交。
12. 最终再次确认本地分支与远端同步、生产 Deployment `1/1 Ready`、镜像和注解 SHA
    正确，并向用户报告实际结果。

发布脚本失败时不要声称已经完成。保留上一版本，收集安全的诊断信息；若新版本已造成
生产异常，按 `docs/troubleshooting.md` 和 `infra/README.md` 回滚并重新验收。

## Git 与发布记录

- 功能/修复与对应版本升级放在同一个发布代码提交中。
- 生产验收记录可以在部署后单独提交，以免改变已部署镜像所对应的代码 SHA。
- 提交信息简洁、聚焦，例如 `fix: improve node detail readability` 和
  `docs: record v1.0.8 production acceptance`。
- 发布目录和验收 artifacts 不提交到 Git；在发布记录中保存其 RS1000 绝对路径。

## 进度与交付沟通

- 自行在关键节点给出简短进度：已确认文档/范围、实现完成、测试结果、发布计划、上线与
  验收结果。不要等用户询问，也不要逐条复述普通命令。
- 遇到失败要立即说明具体阶段、影响范围和下一步；不要用“完成”掩盖未部署或未验收。
- 最终答复必须自包含，并优先报告结果：改了什么、部署版本与 SHA、生产状态、测试与
  验收结果、发布记录位置、任何剩余风险。

## Cursor Cloud specific instructions

面向后续 Cloud Agent 的启动与运行说明（依赖安装由启动脚本 `pnpm install` +
`pnpm exec playwright install chromium` 自动完成，此处不重复安装步骤）。标准命令见
`README.md`、根 `package.json` scripts 与本文件“实施与验证”一节。

- 本地开发不需要 Prometheus/Alertmanager。未设置 `PROMETHEUS_URL` 时 API 正常启动，
  返回退化/占位指标（`/api/*/series` 等会返回 503，属预期），公共状态页仍展示节点。
- API 不读取 `.env` 文件（`env.ts` 只读 `process.env`）。本地跑 `pnpm dev` 无需任何
  配置即可启动（`COOKIE_SECRET` 有 dev 兜底、SQLite 落在 `./data/nodebeacon.db`）。
- 要演示登录/管理端，必须在启动 `pnpm dev` 的同一 shell 里显式导出 owner 凭据等
  环境变量，例如 `INITIAL_OWNER_EMAIL` / `INITIAL_OWNER_PASSWORD`，并把
  `NODEBEACON_NODE_CONFIG` 指向一个可写的 YAML（编辑节点会写回该文件；不要直接写
  `config/nodes.example.yaml`，先复制一份）。参考 `playwright.config.ts` 的
  `webServer.env` 注入方式。
- 登录接口 `/api/auth/login` 限速 5 次/分钟；手动或脚本反复登录容易触发 429/401，
  Playwright 因此 `workers: 1` 串行执行。
- Playwright 需单独指定单一项目：本地/CI 门禁用 `pnpm exec playwright test
  --project=chromium`。`pnpm test:e2e` 默认用 `edge`（msedge channel），Cloud VM 内
  一般只装了 chromium，跑 e2e 请用 `--project=chromium`。Playwright 会自行拉起 API
  (3001) 和 web (4173) 两个 webServer，无需先手动启动 `pnpm dev`。
- 根 `pnpm lint` 先检查 workspace TypeScript，再以 npm 运行 `apps/status-web` 的 ESLint；
  `pnpm typecheck` 另外检查两套前端的 TypeScript。`better-sqlite3` 是原生模块，由
  `pnpm install` 在 `onlyBuiltDependencies` 下自动编译（镜像已带 gcc/g++/make/
  python3）。
