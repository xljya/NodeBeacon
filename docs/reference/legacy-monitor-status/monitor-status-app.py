import html
import json
import os
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


PROMETHEUS_URL = os.environ.get("PROMETHEUS_URL", "http://monitoring-kube-prometheus-prometheus.monitoring:9090")
PORT = int(os.environ.get("PORT", "8080"))
LOCAL_NODE_INSTANCE = os.environ.get("LOCAL_NODE_INSTANCE", "10.42.0.7:9100")
LOCAL_NODE_NAME = os.environ.get("LOCAL_NODE_NAME", "RS1000")


def prometheus_query(query):
    url = f"{PROMETHEUS_URL}/api/v1/query?" + urllib.parse.urlencode({"query": query})
    with urllib.request.urlopen(url, timeout=8) as response:
        payload = json.load(response)
    if payload.get("status") != "success":
        raise RuntimeError(payload)
    return payload["data"]["result"]


def value_map(query):
    values = {}
    for item in prometheus_query(query):
        instance = item["metric"].get("instance", "unknown")
        values[instance] = float(item["value"][1])
    return values


def collect_node_metrics(selector):
    disk_selector = f'{selector},mountpoint="/",fstype!~"tmpfs|overlay|squashfs|fuse.*|ramfs"'
    return {
        "up": value_map(f'up{{{selector}}}'),
        "cpu": value_map(f'100 - (avg by(instance) (rate(node_cpu_seconds_total{{{selector},mode="idle"}}[5m])) * 100)'),
        "memory": value_map(f'(1 - node_memory_MemAvailable_bytes{{{selector}}} / node_memory_MemTotal_bytes{{{selector}}}) * 100'),
        "memory_used": value_map(f'node_memory_MemTotal_bytes{{{selector}}} - node_memory_MemAvailable_bytes{{{selector}}}'),
        "memory_total": value_map(f'node_memory_MemTotal_bytes{{{selector}}}'),
        "disk": value_map(f'(1 - node_filesystem_free_bytes{{{disk_selector}}} / node_filesystem_size_bytes{{{disk_selector}}}) * 100'),
        "disk_used": value_map(f'node_filesystem_size_bytes{{{disk_selector}}} - node_filesystem_free_bytes{{{disk_selector}}}'),
        "disk_total": value_map(f'node_filesystem_size_bytes{{{disk_selector}}}'),
        "load": value_map(f'node_load1{{{selector}}}'),
        "uptime": value_map(f'time() - node_boot_time_seconds{{{selector}}}'),
    }


def append_servers(servers, metrics, name_map=None):
    name_map = name_map or {}
    for instance in sorted(metrics["up"]):
        servers.append({
            "name": name_map.get(instance, instance),
            "online": metrics["up"].get(instance, 0) == 1,
            "cpu": metrics["cpu"].get(instance),
            "memory": metrics["memory"].get(instance),
            "memory_used": metrics["memory_used"].get(instance),
            "memory_total": metrics["memory_total"].get(instance),
            "disk": metrics["disk"].get(instance),
            "disk_used": metrics["disk_used"].get(instance),
            "disk_total": metrics["disk_total"].get(instance),
            "load": metrics["load"].get(instance),
            "uptime": metrics["uptime"].get(instance),
        })


def collect_status():
    public = value_map('probe_success{job="blackbox-http-public"}')
    status_code = value_map('probe_http_status_code{job="blackbox-http-public"}')
    response_time = value_map('probe_duration_seconds{job="blackbox-http-public"}')

    servers = []
    append_servers(servers, collect_node_metrics('job="external-vps-node"'))
    append_servers(
        servers,
        collect_node_metrics(f'job="node-exporter",instance="{LOCAL_NODE_INSTANCE}"'),
        {LOCAL_NODE_INSTANCE: LOCAL_NODE_NAME},
    )

    endpoints = []
    for endpoint in sorted(public):
        endpoints.append({
            "name": endpoint,
            "online": public.get(endpoint, 0) == 1,
            "status_code": int(status_code.get(endpoint, 0)),
            "response_time": response_time.get(endpoint),
        })

    overall_ok = all(s["online"] for s in servers) and all(e["online"] for e in endpoints)
    return {
        "updated_at": int(time.time()),
        "overall_ok": overall_ok,
        "servers": servers,
        "endpoints": endpoints,
    }


def fmt_percent(value):
    if value is None:
        return "n/a"
    return f"{value:.1f}%"


def fmt_number(value):
    if value is None:
        return "n/a"
    return f"{value:.2f}"


def fmt_bytes(value):
    if value is None:
        return "n/a"
    units = ["B", "KiB", "MiB", "GiB", "TiB"]
    size = float(value)
    for unit in units:
        if size < 1024 or unit == units[-1]:
            return f"{size:.1f} {unit}" if unit != "B" else f"{size:.0f} B"
        size /= 1024


def fmt_capacity(used, total, percent):
    if used is None or total is None:
        return fmt_percent(percent)
    return f"{fmt_percent(percent)} · {fmt_bytes(used)} / {fmt_bytes(total)}"


def fmt_duration(seconds):
    if seconds is None:
        return "n/a"
    seconds = int(seconds)
    days, seconds = divmod(seconds, 86400)
    hours, seconds = divmod(seconds, 3600)
    minutes = seconds // 60
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def fmt_seconds(seconds):
    if seconds is None:
        return "n/a"
    return f"{seconds:.2f}s"


def render_html(data):
    title = "All systems operational" if data["overall_ok"] else "Some systems need attention"
    state_class = "ok" if data["overall_ok"] else "bad"
    rows = []
    for server in data["servers"]:
        rows.append(f"""
          <tr>
            <td><span class="dot {'ok' if server['online'] else 'bad'}"></span>{html.escape(server['name'])}</td>
            <td>{'Online' if server['online'] else 'Down'}</td>
            <td>{fmt_percent(server['cpu'])}</td>
            <td>{fmt_capacity(server.get('memory_used'), server.get('memory_total'), server['memory'])}</td>
            <td>{fmt_capacity(server.get('disk_used'), server.get('disk_total'), server['disk'])}</td>
            <td>{fmt_duration(server.get('uptime'))}</td>
            <td>{fmt_number(server['load'])}</td>
          </tr>
        """)

    endpoint_cards = []
    for endpoint in data["endpoints"]:
        endpoint_cards.append(f"""
          <div class="endpoint">
            <div><span class="dot {'ok' if endpoint['online'] else 'bad'}"></span>{html.escape(endpoint['name'])}</div>
            <strong>{'Online' if endpoint['online'] else 'Down'} · HTTP {endpoint['status_code']} · {fmt_seconds(endpoint.get('response_time'))}</strong>
          </div>
        """)

    updated = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime(data["updated_at"]))
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="30">
  <title>liucf monitor</title>
  <style>
    :root {{
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f172a;
      color: #e5e7eb;
    }}
    body {{ margin: 0; background: #0f172a; }}
    main {{ max-width: 1120px; margin: 0 auto; padding: 40px 20px; }}
    header {{ display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin-bottom: 24px; }}
    h1 {{ margin: 0 0 8px; font-size: 32px; letter-spacing: 0; }}
    p {{ margin: 0; color: #94a3b8; }}
    .badge {{ border-radius: 999px; padding: 8px 12px; background: #111827; border: 1px solid #334155; font-weight: 700; white-space: nowrap; }}
    .badge.ok {{ color: #86efac; }}
    .badge.bad {{ color: #fca5a5; }}
    section {{ margin-top: 20px; }}
    h2 {{ font-size: 18px; margin: 0 0 12px; }}
    .panel {{ border: 1px solid #263244; background: #111827; border-radius: 8px; overflow: hidden; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ padding: 14px 16px; text-align: left; border-bottom: 1px solid #263244; }}
    th {{ color: #94a3b8; font-size: 13px; font-weight: 700; }}
    tr:last-child td {{ border-bottom: 0; }}
    .dot {{ display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 10px; }}
    .dot.ok {{ background: #22c55e; box-shadow: 0 0 12px rgba(34, 197, 94, .8); }}
    .dot.bad {{ background: #ef4444; box-shadow: 0 0 12px rgba(239, 68, 68, .8); }}
    .endpoints {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }}
    .endpoint {{ border: 1px solid #263244; background: #111827; border-radius: 8px; padding: 14px 16px; }}
    .endpoint div {{ margin-bottom: 8px; overflow-wrap: anywhere; }}
    .endpoint strong {{ color: #cbd5e1; }}
    footer {{ margin-top: 24px; color: #64748b; font-size: 13px; }}
    @media (max-width: 720px) {{
      header {{ display: block; }}
      .badge {{ display: inline-block; margin-top: 16px; }}
      th:nth-child(6), td:nth-child(6), th:nth-child(7), td:nth-child(7) {{ display: none; }}
    }}
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>liucf monitor</h1>
        <p>Public status summary for VPS nodes and public endpoints.</p>
      </div>
      <div class="badge {state_class}">{title}</div>
    </header>

    <section>
      <h2>Servers</h2>
      <div class="panel">
        <table>
          <thead>
            <tr>
              <th>Instance</th>
              <th>Status</th>
              <th>CPU</th>
              <th>RAM</th>
              <th>Disk /</th>
              <th>Uptime</th>
              <th>Load 1m</th>
            </tr>
          </thead>
          <tbody>
            {''.join(rows)}
          </tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>Public Endpoints</h2>
      <div class="endpoints">
        {''.join(endpoint_cards)}
      </div>
    </section>

    <footer>Last updated: {updated}. Auto-refreshes every 30 seconds.</footer>
  </main>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/healthz":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"ok\n")
            return

        try:
            data = collect_status()
            if self.path.startswith("/api/status"):
                body = json.dumps(data, separators=(",", ":")).encode()
                content_type = "application/json; charset=utf-8"
            else:
                body = render_html(data).encode()
                content_type = "text/html; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            body = f"status unavailable: {html.escape(str(exc))}\n".encode()
            self.send_response(503)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"monitor status listening on :{PORT}")
    server.serve_forever()
