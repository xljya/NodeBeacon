# NodeBeacon repository instructions

本文件适用于整个仓库。开始任何任务前先阅读本文件；进入子目录后，若存在更深层的
`AGENTS.md`，同时遵守更具体的说明。

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
- 不输出 Secret、Cookie、OAuth 凭据、备份密钥、数据库内容或其他敏感信息。

## 项目结构

- `apps/web`: React/Vite 公共状态页、节点详情页和管理界面。
- `apps/api`: Fastify API、认证、Prometheus 查询、SQLite 和节点注册表逻辑。
- `packages/shared`: Web 与 API 共用的类型和契约。
- `e2e`: Playwright 浏览器测试。
- `docs`: 架构决策、实现计划、API 说明、故障处理和发布验收记录。
- `infra`: RS1000 k3s、Prometheus、Cloudflare、nginx 和生产运维说明。
- `scripts`: 部署、生产验收、备份、恢复相关脚本。
- `config`: 本地或种子配置；生产运行时状态位于 PVC，不应从本地文件臆测。

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
- 发布前查看最近的 `docs/releases/`，沿用现有验收记录格式。

若代码、清单、脚本与文档互相矛盾，先通过只读检查确认生产实际状态；不要静默选择其一。
完成任务时同步修正文档或明确报告差异。

## 本机与远端执行边界

- 本机是 Windows 11，命令使用 PowerShell 7。使用 PowerShell cmdlet 和语法，不要在
  本机命令中使用 Bash 的 `&&`、heredoc、`grep`、`sed`、`awk`、`rm` 或 `find`。
- 优先使用 `rg`；若不可用，再使用 `Get-ChildItem`、`Select-String` 等 PowerShell
  工具。
- `ssh RS1000 '...'` 的远端命令运行在 Linux，可使用 POSIX/Bash 语法。保持远端命令
  范围明确，避免把本地变量或秘密意外展开到输出中。
- 生产位于 RS1000 的 `nodebeacon` namespace，流量路径和 NodePort 以
  `infra/README.md` 为准，不要另造部署方式或使用 `latest` 镜像。

## 实施与验证

- 先定位真正负责该行为的源文件；不要修改构建产物、缓存文件或旧原型来掩盖问题。
- UI 变更至少检查桌面与移动响应式行为、明暗主题、文本可读性和交互可用性。涉及线上
  UI 时，发布后必须用真实浏览器访问生产 URL，确认关键元素、计算样式或交互，而不只
  是请求 HTML。
- API 或数据结构变更要同步检查 `packages/shared`、API 路由/服务、Web 消费端、测试和
  API 文档。
- 基础设施变更先渲染或 dry-run，再应用；生产状态、PVC、Secret、监控栈和备份均按
  `infra/README.md` 的专门流程处理。
- 修改后运行与风险相称的测试。生产发布的标准本地门禁为：

```powershell
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
2. 将 patch 版本同步提升到以下三处，三者必须一致：
   - 根目录 `package.json` 的 `version`；
   - `infra/k8s/deployment.yaml` 的 `nodebeacon:<version>`；
   - `infra/k8s/restore-pod.example.yaml` 的 `nodebeacon:<version>`。
3. 完成全部本地门禁与 diff 检查。
4. 提交发布代码并推送当前分支。不要擅自合并到 `main`，不要强推。
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
