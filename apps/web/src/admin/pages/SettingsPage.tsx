import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import type { AdminSummaryResponse } from "@nodebeacon/shared";
import { useApi } from "../../lib/useApi";

export function SettingsPage() {
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
        <h2>设置</h2>
        <span className="page-sub">本版为只读；写入能力随管理端写回一起开放</span>
      </div>

      <div className="setting-list">
        <SettingCard title="开放注册" desc="是否允许自由注册新账号（生产环境应保持关闭）">
          <span className={`pill ${data.auth.allowRegister ? "pill-warn" : "pill-ok"}`}>
            {data.auth.allowRegister ? "开启" : "关闭"}
          </span>
        </SettingCard>

        <SettingCard title="状态缓存 TTL" desc="/api/status 的短缓存时长，防止刷新打爆 Prometheus">
          <span className="pill mono">{data.cache.ttlSeconds}s</span>
        </SettingCard>

        <SettingCard title="数据源 Prometheus" desc="后端服务端查询目标（凭据不下发到浏览器）">
          <span className="pill mono">{data.prometheus.host ?? "未配置"}</span>
        </SettingCard>

        <SettingCard title="公开展示策略" desc="公开状态页展示基础在线状态；敏感信息需登录后查看">
          <span className="pill">公开只读</span>
        </SettingCard>
      </div>
    </div>
  );
}

function SettingCard({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section className="setting-card">
      <div className="setting-text">
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
      <div className="setting-control">{children}</div>
    </section>
  );
}
