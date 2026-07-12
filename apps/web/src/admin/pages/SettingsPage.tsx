import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowUpRight,
  Bell,
  Check,
  Copy,
  Database,
  Globe2,
  LockKeyhole,
  Palette,
  RefreshCw,
  Server,
  Settings2
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminSummaryResponse } from "@nodebeacon/shared";
import { AppearanceControls } from "./ThemeSettingsPage";
import { useApi } from "../../lib/useApi";
import { PageError, PageLoading } from "../components/PageState";

const SETTINGS_INDEX = [
  { slug: "site", label: "Site", icon: Globe2 },
  { slug: "theme", label: "Theme Management", icon: Palette },
  { slug: "sign-on", label: "Sign-On", icon: LockKeyhole },
  { slug: "notifications", label: "Notifications", icon: Bell },
  { slug: "general", label: "General", icon: Settings2 },
  { slug: "reverse-proxy", label: "Reverse Proxy", icon: ArrowUpRight },
  { slug: "metrics", label: "Metrics Database", icon: Database }
] as const;

export function SettingsPage() {
  const { t } = useTranslation();
  const { section = "site" } = useParams();
  const { data, error, loading, reload } = useApi<AdminSummaryResponse>("/api/admin/summary");

  if (loading) return <PageLoading />;
  if (error || !data) return <PageError message={error ?? t("common.loadFailed")} />;

  const current = SETTINGS_INDEX.find((item) => item.slug === section) ?? SETTINGS_INDEX[0];
  const Icon = current.icon;

  return (
    <div className="page settings-workspace">
      <div className="page-head page-head-spread">
        <div>
          <h2>{current.label}</h2>
          <span className="page-sub">NodeBeacon administration settings</span>
        </div>
        <button className="ghost-btn" onClick={() => void reload()}>
          <RefreshCw size={15} /> {t("admin.actions.refresh")}
        </button>
      </div>

      <section className="section-panel settings-focus-panel">
        <div className="section-head">
          <div>
            <h3>{current.label}</h3>
            <p>{descriptionFor(section)}</p>
          </div>
          <Icon size={20} />
        </div>
        <SettingsContent section={section} summary={data} />
      </section>

      <section className="settings-index" aria-label="Settings sections">
        {SETTINGS_INDEX.map(({ slug, label, icon: ItemIcon }) => (
          <Link key={slug} to={`/admin/settings/${slug}`} className={slug === current.slug ? "settings-index-link active" : "settings-index-link"}>
            <ItemIcon size={17} />
            <span>{label}</span>
            <ArrowUpRight size={15} />
          </Link>
        ))}
      </section>
    </div>
  );
}

function SettingsContent({ section, summary }: { section: string; summary: AdminSummaryResponse }) {
  switch (section) {
    case "theme":
      return <AppearanceControls compact />;
    case "sign-on":
      return (
        <div className="setting-list">
          <SettingRow label="Owner authentication" value={summary.auth.ownerConfigured ? "Configured" : "Not configured"} ok={summary.auth.ownerConfigured} />
          <SettingRow label="Open registration" value={summary.auth.allowRegister ? "Enabled" : "Disabled"} ok={!summary.auth.allowRegister} />
          <Link className="primary-btn settings-link-button" to="/admin/account">Open Account <ArrowUpRight size={15} /></Link>
        </div>
      );
    case "notifications":
      return <SettingsLink target="/admin/notification/general" text="Open notification rules" />;
    case "general":
      return (
        <div className="setting-list">
          <SettingRow label="Application version" value={`v${summary.version}`} />
          <SettingRow label="Status cache" value={`${summary.cache.ttlSeconds}s TTL`} ok={!summary.cache.stale} />
          <SettingRow label="Node registry" value="Writable YAML registry" ok />
        </div>
      );
    case "reverse-proxy":
      return <CopyOrigin />;
    case "metrics":
      return (
        <div className="setting-list">
          <SettingRow label="Prometheus host" value={summary.prometheus.host ?? "Not configured"} />
          <SettingRow label="Connection status" value={summary.prometheus.reachable ? "Reachable" : "Unavailable / fallback"} ok={summary.prometheus.reachable} />
        </div>
      );
    case "site":
    default:
      return <SiteSettings />;
  }
}

function SiteSettings() {
  return (
    <div className="setting-list">
      <SettingRow label="Public status page" value="Available to visitors" ok />
      <div className="settings-action-row">
        <a className="primary-btn settings-link-button" href="/">Open public status <ArrowUpRight size={15} /></a>
        <CopyOrigin />
      </div>
    </div>
  );
}

function CopyOrigin() {
  const [copied, setCopied] = useState(false);
  const origin = window.location.origin;
  const copy = async () => {
    await navigator.clipboard?.writeText(origin);
    setCopied(true);
  };

  return (
    <div className="settings-action-row">
      <code className="selector">{origin}</code>
      <button className="ghost-btn" onClick={() => void copy()}>
        {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy URL"}
      </button>
    </div>
  );
}

function SettingsLink({ target, text }: { target: string; text: string }) {
  return <Link className="primary-btn settings-link-button" to={target}>{text} <ArrowUpRight size={15} /></Link>;
}

function SettingRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="setting-card flat">
      <div className="setting-text"><h3>{label}</h3></div>
      <span className={ok === undefined ? "pill" : ok ? "pill pill-ok" : "pill pill-warn"}>{value}</span>
    </div>
  );
}

function descriptionFor(section: string): string {
  const descriptions: Record<string, string> = {
    site: "Public status entry and the canonical service URL.",
    theme: "Appearance controls stored in this browser.",
    "sign-on": "Effective owner-authentication information.",
    notifications: "Rule categories and notification readiness.",
    general: "Runtime values that are safe to inspect from the console.",
    "reverse-proxy": "The public URL that a reverse proxy should forward.",
    metrics: "The server-side Prometheus integration."
  };
  return descriptions[section] ?? descriptions.site ?? "";
}
