# Handoff: SRE 监控状态页面 (Self-hosted Status Page)

## Overview
An infrastructure **status / monitoring page** for a fleet of self-hosted servers, faithfully recreating the **Komari Monitor** open-source dashboard layout. It shows a toolbar (search, view mode, group tabs, language switcher), a summary strip (time/online/region/traffic/speed), a grid or table of node cards (CPU/RAM/disk usage, tags, OS), and a per-node detail view with load charts and multi-ISP latency charts. Dark/light themes included.

## About the Design Files
The files in this bundle are **design references created in HTML** — a prototype showing intended look and behavior, **not production code to copy directly**. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, Svelte, etc.) using its established patterns, component library, and data layer.

`Status Page.dc.html` is a "Design Component" (a self-contained HTML prototype). `support.js` is only the prototype's runtime shim — **do not port it**; it exists so the HTML opens in a browser. Ignore the `<x-dc>`, `<sc-for>`, `<sc-if>`, `{{ … }}` template syntax and the `renderVals()` method — those are prototype plumbing. Port the **markup, styles, layout, interaction logic, and mock data shape** into idiomatic components in your stack.

`monitoring-setup.md` is the **real data-plumbing spec** — how each field on the page maps to a real metric (node_exporter / blackbox_exporter / Prometheus / Alertmanager PromQL). Treat it as the backend contract when wiring live data.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, shadows, and interactions are all specified. Recreate the UI pixel-accurately using your codebase's libraries. Charts are drawn as inline SVG in the prototype (seeded random mock data) — replace the mock series with real time-series from your data source but keep the visual treatment (stroke widths, grid, fill opacity, colors below).

---

## Layout — Komari Monitor

Two views driven by state:

**Dashboard view** (`kDashView`, default)
- **Top bar**: brand ("夜雀团子" + "Komari Monitor"), and right-side icon buttons — GitHub link, theme toggle, theme-color, language switcher (opens a popover list: English / Bahasa Indonesia / 日本語 / 简体中文 / 繁體中文), and a filled **Login** button.
- **Summary strip**: a panel showing Current Time (live clock), Current Online (`x / y`), Region count, Traffic Overview (↑/↓ totals), Network Speed (↑/↓). A gear button opens a **"状态显示设置"** popover with toggle switches to show/hide each of those 5 summary items.
- **Controls row**: full-width search input (filters nodes by name/region/OS), and a **View Mode** segmented control (grid / table).
- **Group tabs**: All / HK / 国内 (filters by node group).
- **Count line**: "N servers total, M online".
- **Grid view**: 4-column responsive grid of node cards. Each card = flag + name, trend icon, status pill (Online/Offline), and CPU / RAM / Disk usage bars with % and sub-labels. Card hover lifts (`translateY(-5px)`) with accent border + glow. Click opens the node detail view.
- **Table view**: dense rows (grid columns: flag, name, status, os, cpu, ram, disk, traffic, up/down speed, tags). Rows expand inline to reveal a multi-ISP ping chart.

**Node detail view** (opens on node click)
- **Left sidebar**: nodes grouped by 国内 / HK / 未分组, active node highlighted with an accent inset bar.
- **Header**: flag + name + status, UUID, close button (returns to dashboard).
- **Tabs**: 负载 (Load) / 延迟 (Latency).
  - *Load tab*: 6 chart cards — CPU, Ram, Disk, 网络 (network, 2-line up/down), 连接数 (TCP/UDP), 进程数 (processes). Each is a filled/line SVG area chart with y-axis grid + labels and a time range pill row (实时 / 4 小时 / 1 天 / 7 天 / 30 天 / 90 天). Plus a spec panel: OS full name, kernel, virt, arch, CPU model, mem, disk, uptime, swap, last report time.
  - *Latency tab*: large multi-ISP ping chart (浙江移动 / 浙江电信 / 浙江联通, 3 colored lines) with per-ISP stat line (ms / 丢包 / 波动), a range pill row, and a **smoothing** toggle.

---

## Design Tokens

Theme is applied by setting CSS custom properties on a container. Two themes: **DARK** (default) and **LIGHT**. Toggle swaps the variable block.

### DARK
```
--bg:#0a0d13;  --bg2:#0e131b;  --panel:#111722;  --panel2:#151c28;  --border:#1e2836;
--text:#e7edf6;  --text-dim:#9aa7ba;  --text-mute:#606e82;
--accent:#3b82f6;  --accent2:#6ba8ff;
--ok:#35d69a;   --ok-weak:rgba(53,214,154,.14);
--warn:#f5b23d; --warn-weak:rgba(245,178,61,.15);
--crit:#f76257; --crit-weak:rgba(247,98,87,.15);
--ring-track:rgba(255,255,255,.07);  --shadow:rgba(0,0,0,.45);
/* page background behind the card: #0b0e14 */
```

### LIGHT
```
--bg:#eef1f7;  --bg2:#f6f8fc;  --panel:#ffffff;  --panel2:#f6f8fd;  --border:#e3e8f1;
--text:#0e1626;  --text-dim:#4c5a6e;  --text-mute:#8592a4;
--accent:#2563eb;  --accent2:#2f6ff0;
--ok:#12a373;   --ok-weak:rgba(18,163,115,.12);
--warn:#c9820f; --warn-weak:rgba(201,130,15,.14);
--crit:#d94438; --crit-weak:rgba(217,68,56,.12);
--ring-track:rgba(0,0,0,.08);  --shadow:rgba(20,30,50,.12);
```

### Usage thresholds (bars color)
- usage ≥ 90% → `--crit`
- usage ≥ 75% → `--warn`
- else → `--ok`

### Typography
- **Space Grotesk** — primary UI sans (weights 400/500/600/700). Node names, labels, buttons.
- **JetBrains Mono** — numeric/monospace (clock, metric values, chart axis labels, id badges).
- Load via Google Fonts (see the `<link>` in `<helmet>`).

### Type scale (key sizes, px)
- Brand name 22 / brand sub 14
- Card node name 16, status pill 11, metric value 15–17
- Section labels 12–13, muted meta 11–12
- Detail chart header ~ per-card; axis labels 11.5–12

### Spacing / radius / shadow
- Outer card radius **18px**; panels **14px**; inner controls/buttons **8–12px**; pills **6–20px**.
- Icon buttons: **38×38**, radius 9.
- Common gaps: 12 / 14 / 16 / 18px; card padding 18–24px; top bar padding 18px 26px.
- Elevated popovers: `box-shadow:0 24px 60px var(--shadow)`; big card shadow `0 30px 80px var(--shadow)`.
- Card hover: `translateY(-5px)` + `border-color:var(--accent)` + accent glow, transition `.2s cubic-bezier(.2,.7,.3,1)`.

### Icons
All icons are inline SVG (feather-style 2px stroke, 18px), and small brand/OS logos (GitHub, Windows, Ubuntu, Debian) are inline SVG paths. Country flags are emoji. Replace with your icon set if you have one; keep sizes.

---

## Interactions & Behavior
- **Theme toggle** — swaps DARK/LIGHT variable block on the root container.
- **Language switcher** — button toggles a popover list; selecting sets `lang` and closes it. (Prototype does not actually translate strings — wire to your i18n.)
- **Summary settings gear** — toggles a popover of 5 switches (`time / online / region / traffic / speed`) that show/hide summary items.
- **Search** — live filter over name + osText + group (case-insensitive substring).
- **View mode** — grid ↔ table segmented control.
- **Group tabs** — All / HK / 国内 filter.
- **Node card / row click** — opens node detail (`detailNode` = name, `detailTab` = 'load').
- **Detail tabs** — 负载 / 延迟.
- **Detail sidebar** — click a node to switch detail target.
- **Close** — returns to dashboard (`detailNode` = null).
- **Table row** — click to expand/collapse an inline ping chart.
- **Latency smoothing toggle** — smooths the ping series (moving average, window 4) and rescales the y-axis (28ms smoothed vs 280ms raw).
- **Live clock** — updates every second (see `componentDidMount` in the prototype; format `HH:MM:SS`).
- Auto-refresh intent: poll live values every ~30s (per monitoring-setup.md).

## State Management (shape to port)
```
theme: 'dark' | 'light'
lang: 'en'|'id'|'ja'|'zh'|'zh-tw'
langOpen: boolean
cfg: { time, online, region, traffic, speed : boolean }   // summary visibility
cfgOpen: boolean
komariView: 'grid' | 'table'
komariGroup: 'All' | 'HK' | '国内'
komariQuery: string
komariSmooth: boolean
expandedNode: string | null      // table inline expand
detailNode: string | null        // null = dashboard, else detail view
detailTab: 'load' | 'latency'
loadRange / latRange: string      // active time-range pill
clock: string                     // ticking HH:MM:SS
```

## Data model (per node — from `KDATA` in the prototype)
```
n: name, f: flag emoji, grp: group, os: 'debian'|'ubuntu'|'windows', arch: 'amd64'|'arm64',
on: online boolean, cpu: %, ram: [pct, "used / total"], disk: [pct, "used / total"],
tf: cumulative traffic "↑ … ↓ …", ns: net speed "↑ … ↓ …", up: uptime string,
tg: [[label, kind], …]  // kind ∈ price|day|term|exp|spon|net → tag color
```
`OSINFO` provides full OS name / kernel / virt / CPU model per OS for the detail spec panel. **Replace all of this mock data with the real Prometheus queries in `monitoring-setup.md`.**

## Charts
- **Ping / latency chart** (`pingChart`): multi-line SVG, 3 ISP series, y grid with `Nms` labels, optional smoothing. Colors: 移动 `#f2777a`, 电信 `#5cbd6a`, 联通 `#9a8cf0`.
- **Load cards** (`mkChart`): area (fill opacity 0.16) + line SVG, per-metric y ticks, x range labels. Stroke 1.7, coral `--crit` for single-series, teal `#4bb6c4` for the up/down second line.
- All charts: `strokeLinejoin/Linecap: round`, axis text in JetBrains Mono, grid stroke `--border`.
- Port to your charting lib but match stroke widths, colors, grid, and fill opacity.

## Assets
- No external image assets. Fonts via Google Fonts. Icons + OS/brand logos are inline SVG (copy from the prototype). Flags are emoji.

## Screenshot
`screenshots/option-3a-komari.png` — reference capture of the layout (a node row expanded to show the spec + ping detail).

## Files in this bundle
- `Status Page.dc.html` — the full prototype (markup, styles, behavior, mock data).
- `support.js` — prototype runtime shim only. **Do not port.**
- `monitoring-setup.md` — real metric mapping (node_exporter / blackbox_exporter / Prometheus / Alertmanager PromQL, 90-day recording rules, incident timeline, CORS). **The backend contract.**
- `README.md` — this file.
