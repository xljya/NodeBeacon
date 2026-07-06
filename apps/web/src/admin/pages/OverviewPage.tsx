import type { ReactNode } from "react";
import { AlertCircle, Database, Gauge, Server, ShieldCheck } from "lucide-react";
import type { AdminSummaryResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";

export function OverviewPage() {
  const { data, error, loading } = useApi<AdminSummaryResponse>("/api/admin/summary");

  if (loading) return <div className="admin-state">加载中…</div>;
  if (error) {
    return (
      <div className="admin-state error">
        <AlertCircle size={16} /> {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="page">
      <div className="page-head">
        <h2>总览</h2>
        <span className="page-sub">
          生成于 {new Date(data.generatedAt).toLocaleString()} · v{data.version}
        </span>
      </div>

      <div className="card-grid">
        <Card icon={<Server size={18} />} title="节点">
          <div className="metric">
            {data.nodes.online}
            <span> / {data.nodes.total} 在线</span>
          </div>
          <div className="metric-sub">
            降级 {data.nodes.degraded} · 离线 {data.nodes.offline}
          </div>
        </Card>

        <Card icon={<Database size={18} />} title="数据源 Prometheus">
          <div className="kv">
            <span>状态</span>
            <b className={data.prometheus.reachable ? "ok" : "bad"}>
              {data.prometheus.configured
                ? data.prometheus.reachable
                  ? "可达"
                  : "不可达 / 降级"
                : "未配置"}
            </b>
          </div>
          <div className="kv">
            <span>Host</span>
            <b className="mono">{data.prometheus.host ?? "—"}</b>
          </div>
        </Card>

        <Card icon={<Gauge size={18} />} title="缓存">
          <div className="kv">
            <span>TTL</span>
            <b className="mono">{data.cache.ttlSeconds}s</b>
          </div>
          <div className="kv">
            <span>数据</span>
            <b className={data.cache.stale ? "bad" : "ok"}>{data.cache.stale ? "stale 降级" : "实时"}</b>
          </div>
        </Card>

        <Card icon={<ShieldCheck size={18} />} title="认证">
          <div className="kv">
            <span>Owner</span>
            <b className={data.auth.ownerConfigured ? "ok" : "bad"}>
              {data.auth.ownerConfigured ? "已配置" : "未配置"}
            </b>
          </div>
          <div className="kv">
            <span>开放注册</span>
            <b>{data.auth.allowRegister ? "是" : "否"}</b>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="card">
      <div className="card-title">
        {icon}
        <span>{title}</span>
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}
