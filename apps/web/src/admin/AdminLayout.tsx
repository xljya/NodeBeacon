import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity,
  BookOpen,
  ExternalLink,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Server,
  Settings,
  Sun,
  Users
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminSummaryResponse } from "@nodebeacon/shared";
import { useAuth } from "../auth/AuthProvider";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { useApi } from "../lib/useApi";
import "./admin.css";

const NAV_GROUPS = [
  {
    labelKey: "admin.nav.groupMonitor",
    items: [
      { to: "/admin", labelKey: "admin.nav.overview", icon: LayoutDashboard, end: true },
      { to: "/admin/nodes", labelKey: "admin.nav.nodes", icon: Server, end: false }
    ]
  },
  {
    labelKey: "admin.nav.groupManage",
    items: [
      { to: "/admin/users", labelKey: "admin.nav.users", icon: Users, end: false },
      { to: "/admin/settings", labelKey: "admin.nav.settings", icon: Settings, end: false },
      { to: "/admin/activity", labelKey: "admin.nav.activity", icon: Activity, end: false },
      { to: "/admin/about", labelKey: "admin.nav.about", icon: Info, end: false }
    ]
  }
];

const SIDEBAR_LINKS = [
  { href: "/", labelKey: "admin.nav.public", icon: ExternalLink, external: false },
  {
    href: "https://github.com/xljya/NodeBeacon/blob/main/docs/development-plan.md",
    labelKey: "admin.nav.documentation",
    icon: BookOpen,
    external: true
  }
];

type Theme = "light" | "dark";

export function AdminLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { data: summary } = useApi<AdminSummaryResponse>("/api/admin/summary");
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("nb-admin-theme") as Theme) ?? "light"
  );

  useEffect(() => {
    localStorage.setItem("nb-admin-theme", theme);
  }, [theme]);

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="admin-shell" data-theme={theme}>
      {sidebarOpen && <button className="admin-scrim" aria-label={t("admin.topbar.closeMenu")} onClick={() => setSidebarOpen(false)} />}
      <aside className={sidebarOpen ? "admin-sidebar open" : "admin-sidebar"}>
        <div className="admin-brand">
          <span className="admin-logo">◈</span> NodeBeacon
          {summary?.version && <span className="admin-brand-version">v{summary.version}</span>}
        </div>
        <nav className="admin-nav">
          {NAV_GROUPS.map((group) => (
            <div className="admin-nav-section" key={group.labelKey}>
              <div className="admin-nav-heading">{t(group.labelKey)}</div>
              {group.items.map(({ to, labelKey, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => (isActive ? "admin-nav-item active" : "admin-nav-item")}
                >
                  <Icon size={17} />
                  <span>{t(labelKey)}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-links">
          {SIDEBAR_LINKS.map(({ href, labelKey, icon: Icon, external }) => (
            <a
              className="admin-nav-item"
              href={href}
              key={labelKey}
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
            >
              <Icon size={17} />
              <span>{t(labelKey)}</span>
            </a>
          ))}
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              className="icon-btn admin-menu-btn"
              title={t("admin.topbar.openMenu")}
              aria-label={t("admin.topbar.openMenu")}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={17} />
            </button>
            <div>
              <div className="admin-topbar-title">{t("admin.topbar.title")}</div>
              <div className="admin-topbar-sub">{t("admin.topbar.subtitle")}</div>
            </div>
          </div>
          <div className="admin-topbar-actions">
            {summary?.version && <span className="admin-version-chip">v{summary.version}</span>}
            <LanguageSwitch />
            <button
              className="icon-btn"
              title={t("admin.topbar.toggleTheme")}
              onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <span className="admin-user" title={user?.email}>
              {user?.email}
            </span>
            <button className="ghost-btn" onClick={handleLogout}>
              <LogOut size={15} />
              <span className="admin-hide-sm">{t("admin.topbar.logout")}</span>
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
