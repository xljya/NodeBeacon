import { useEffect, useState, type CSSProperties } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  AtSign,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronUp,
  CircleUserRound,
  Droplet,
  Gauge,
  Globe2,
  Home,
  KeyRound,
  LogOut,
  Menu,
  Moon,
  Palette,
  Radar,
  ScrollText,
  Server,
  Settings,
  Sun,
  Terminal
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminSummaryResponse } from "@nodebeacon/shared";
import { useAuth } from "../auth/AuthProvider";
import { LanguageSwitch } from "../components/LanguageSwitch";
import {
  ADMIN_ACCENTS,
  ADMIN_APPEARANCE_EVENT,
  getAdminAppearance,
  saveAdminAppearance,
  type AdminAppearance
} from "../lib/adminAppearance";
import { useApi } from "../lib/useApi";
import "./admin.css";

interface NestedNavItem {
  to: string;
  label: string;
  icon: typeof Settings;
}

const SETTINGS_ITEMS: NestedNavItem[] = [
  { to: "/admin/settings/site", label: "site", icon: Home },
  { to: "/admin/settings/theme", label: "theme", icon: Palette },
  { to: "/admin/settings/sign-on", label: "signOn", icon: CircleUserRound },
  { to: "/admin/settings/notifications", label: "notifications", icon: Bell },
  { to: "/admin/settings/general", label: "general", icon: Settings },
  { to: "/admin/settings/xtermjs", label: "xtermjs", icon: Terminal },
  { to: "/admin/settings/reverse-proxy", label: "reverseProxy", icon: Globe2 },
  { to: "/admin/settings/metrics", label: "metrics", icon: Server }
];

const NOTIFICATION_ITEMS: NestedNavItem[] = [
  { to: "/admin/notification/offline", label: "offline", icon: Bell },
  { to: "/admin/notification/load", label: "load", icon: Activity },
  { to: "/admin/notification/traffic-report", label: "trafficReport", icon: Activity },
  { to: "/admin/notification/general", label: "general", icon: Settings }
];

export function AdminLayout() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { data: summary } = useApi<AdminSummaryResponse>("/api/admin/summary");
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appearance, setAppearance] = useState<AdminAppearance>(getAdminAppearance);
  const [settingsOpen, setSettingsOpen] = useState(() => location.pathname.startsWith("/admin/settings"));
  const [notificationOpen, setNotificationOpen] = useState(() => location.pathname.startsWith("/admin/notification"));

  useEffect(() => {
    const syncAppearance = () => setAppearance(getAdminAppearance());
    window.addEventListener(ADMIN_APPEARANCE_EVENT, syncAppearance);
    return () => window.removeEventListener(ADMIN_APPEARANCE_EVENT, syncAppearance);
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith("/admin/settings")) setSettingsOpen(true);
    if (location.pathname.startsWith("/admin/notification")) setNotificationOpen(true);
  }, [location.pathname]);

  const cycleAccent = () => {
    const index = ADMIN_ACCENTS.indexOf(appearance.accent as (typeof ADMIN_ACCENTS)[number]);
    saveAdminAppearance({ accent: ADMIN_ACCENTS[(index + 1) % ADMIN_ACCENTS.length] ?? ADMIN_ACCENTS[0] });
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="admin-shell komari-admin" data-theme={appearance.theme} style={{ "--accent": appearance.accent } as CSSProperties}>
      {sidebarOpen && <button className="admin-scrim" aria-label={t("admin.topbar.closeMenu")} onClick={() => setSidebarOpen(false)} />}

      <aside className={sidebarOpen ? "admin-sidebar open" : "admin-sidebar"}>
        <nav className="admin-nav komari-nav" aria-label={t("admin.topbar.title")}>
          <div className="admin-nav-section">
            <div className="admin-nav-heading">{t("admin.nav.groupMonitor")}</div>
            <AdminLink to="/admin" end icon={Server} label={t("admin.nav.server")} onNavigate={() => setSidebarOpen(false)} />
          </div>
          <div className="admin-nav-section">
            <div className="admin-nav-heading">{t("admin.nav.groupManage")}</div>
            <NestedNavGroup
              icon={Settings}
              label={t("admin.nav.settings")}
              open={settingsOpen}
              onToggle={() => setSettingsOpen((open) => !open)}
              onNavigate={() => setSidebarOpen(false)}
              items={SETTINGS_ITEMS.map((item) => ({ ...item, label: t(`admin.nav.${item.label}`) }))}
            />
            <NestedNavGroup
              icon={Bell}
              label={t("admin.nav.notification")}
              open={notificationOpen}
              onToggle={() => setNotificationOpen((open) => !open)}
              onNavigate={() => setSidebarOpen(false)}
              items={NOTIFICATION_ITEMS.map((item) => ({ ...item, label: t(`admin.nav.${item.label}`) }))}
            />
            <AdminLink to="/admin/exec" icon={Terminal} label={t("admin.nav.remoteExec")} onNavigate={() => setSidebarOpen(false)} />
            <AdminLink to="/admin/ping" icon={Gauge} label={t("admin.nav.latency")} onNavigate={() => setSidebarOpen(false)} />
            <AdminLink to="/admin/sessions" icon={KeyRound} label={t("admin.nav.sessions")} onNavigate={() => setSidebarOpen(false)} />
            <AdminLink to="/admin/account" icon={CircleUserRound} label={t("admin.nav.account")} onNavigate={() => setSidebarOpen(false)} />
            <AdminLink to="/admin/logs" icon={ScrollText} label={t("admin.nav.logs")} onNavigate={() => setSidebarOpen(false)} />
            <AdminLink to="/admin/about" icon={AtSign} label={t("admin.nav.about")} onNavigate={() => setSidebarOpen(false)} />
            <AdminLink to="/admin/theme" icon={Palette} label={t("admin.nav.defaultTheme")} onNavigate={() => setSidebarOpen(false)} />
          </div>
          <div className="admin-sidebar-links">
            <a className="admin-nav-item" href="https://github.com/xljya/NodeBeacon/blob/main/docs/development-plan.md" target="_blank" rel="noreferrer">
              <BookOpen size={18} strokeWidth={2} />
              <span>{t("admin.nav.documentation")}</span>
            </a>
            <a className="admin-nav-item" href="/">
              <Home size={18} strokeWidth={2} />
              <span>{t("admin.nav.home")}</span>
            </a>
          </div>
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button className="top-icon admin-menu-btn" title={t("admin.topbar.openMenu")} aria-label={t("admin.topbar.openMenu")} onClick={() => setSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="admin-brand">
              <button className="brand-menu" aria-label={t("admin.topbar.openMenu")} onClick={() => setSidebarOpen(true)}>
                <Menu size={21} />
              </button>
              <strong>
                <Radar size={19} strokeWidth={2.25} aria-hidden="true" />
                NodeBeacon
              </strong>
              <span>status / {summary?.version ?? "dev"}</span>
            </div>
          </div>

          <div className="admin-topbar-actions">
            <button
              className="top-icon"
              title={t("admin.topbar.toggleTheme")}
              aria-label={t("admin.topbar.toggleTheme")}
              onClick={() => saveAdminAppearance({ theme: appearance.theme === "light" ? "dark" : "light" })}
            >
              {appearance.theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button className="top-icon" title={t("admin.topbar.color")} aria-label={t("admin.topbar.color")} onClick={cycleAccent}>
              <Droplet size={18} />
            </button>
            <div className="top-lang" title={t("status.language")}>
              <LanguageSwitch />
            </div>
            <button className="top-icon logout-icon" title={t("admin.topbar.logout")} aria-label={t("admin.topbar.logout")} onClick={handleLogout}>
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function AdminLink({ to, icon: Icon, label, end = false, onNavigate }: { to: string; icon: typeof Settings; label: string; end?: boolean; onNavigate: () => void }) {
  return (
    <NavLink to={to} end={end} onClick={onNavigate} className={({ isActive }) => (isActive ? "admin-nav-item active" : "admin-nav-item")}>
      <Icon size={18} strokeWidth={2} />
      <span>{label}</span>
    </NavLink>
  );
}

function NestedNavGroup({ icon: Icon, label, open, onToggle, onNavigate, items }: { icon: typeof Settings; label: string; open: boolean; onToggle: () => void; onNavigate: () => void; items: NestedNavItem[] }) {
  return (
    <section className="admin-nav-group">
      <button type="button" className={open ? "admin-nav-item nav-group-toggle active" : "admin-nav-item nav-group-toggle"} aria-expanded={open} onClick={onToggle}>
        <Icon size={18} strokeWidth={2} />
        <span>{label}</span>
        {open ? <ChevronUp className="nav-chevron" size={16} /> : <ChevronDown className="nav-chevron" size={16} />}
      </button>
      {open && (
        <div className="admin-nav-nested">
          {items.map(({ to, label: childLabel, icon: ChildIcon }) => (
            <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => (isActive ? "admin-nav-item admin-nav-child active" : "admin-nav-item admin-nav-child")}>
              <ChildIcon size={17} strokeWidth={2} />
              <span>{childLabel}</span>
            </NavLink>
          ))}
        </div>
      )}
    </section>
  );
}
