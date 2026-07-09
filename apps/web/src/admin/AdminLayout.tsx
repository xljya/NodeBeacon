import { useEffect, useState, type CSSProperties } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity,
  AtSign,
  Bell,
  BookOpen,
  ChevronDown,
  CircleUserRound,
  Droplet,
  Home,
  LogOut,
  Menu,
  Moon,
  Palette,
  ScrollText,
  Server,
  Settings,
  Sun,
  Terminal,
  UsersRound
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AdminSummaryResponse } from "@nodebeacon/shared";
import { useAuth } from "../auth/AuthProvider";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { useApi } from "../lib/useApi";
import "./admin.css";

const NAV_ITEMS = [
  { to: "/admin", labelKey: "admin.nav.server", icon: Server, end: true },
  { to: "/admin/settings", labelKey: "admin.nav.settings", icon: Settings, end: false, expandable: true },
  { to: "/admin/notification", labelKey: "admin.nav.notification", icon: Bell, end: false, expandable: true },
  { to: "/admin/remote-exec", labelKey: "admin.nav.remoteExec", icon: Terminal, end: false },
  { to: "/admin/latency", labelKey: "admin.nav.latency", icon: Activity, end: false },
  { to: "/admin/sessions", labelKey: "admin.nav.sessions", icon: UsersRound, end: false },
  { to: "/admin/account", labelKey: "admin.nav.account", icon: CircleUserRound, end: false },
  { to: "/admin/logs", labelKey: "admin.nav.logs", icon: ScrollText, end: false },
  { to: "/admin/about", labelKey: "admin.nav.about", icon: AtSign, end: false },
  {
    href: "https://github.com/xljya/NodeBeacon/blob/main/docs/development-plan.md",
    labelKey: "admin.nav.documentation",
    icon: BookOpen
  },
  { href: "/", labelKey: "admin.nav.home", icon: Home },
  { to: "/admin/theme", labelKey: "admin.nav.defaultTheme", icon: Palette, end: false }
];

type Theme = "light" | "dark";
const DEFAULT_ACCENT = "#2f6bff";
const ACCENTS = [DEFAULT_ACCENT, "#1f9d63", "#c67a12"] as const;

export function AdminLayout() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { data: summary } = useApi<AdminSummaryResponse>("/api/admin/summary");
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem("nb-admin-theme") as Theme) ?? "light"
  );
  const [accent, setAccent] = useState(() => localStorage.getItem("nb-admin-accent") ?? DEFAULT_ACCENT);

  useEffect(() => {
    localStorage.setItem("nb-admin-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("nb-admin-accent", accent);
  }, [accent]);

  const cycleAccent = () => {
    setAccent((current) => ACCENTS[(Math.max(0, ACCENTS.indexOf(current as (typeof ACCENTS)[number])) + 1) % ACCENTS.length] ?? DEFAULT_ACCENT);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="admin-shell komari-admin" data-theme={theme} style={{ "--accent": accent } as CSSProperties}>
      {sidebarOpen && <button className="admin-scrim" aria-label={t("admin.topbar.closeMenu")} onClick={() => setSidebarOpen(false)} />}

      <aside className={sidebarOpen ? "admin-sidebar open" : "admin-sidebar"}>
        <nav className="admin-nav komari-nav" aria-label={t("admin.topbar.title")}>
          {NAV_ITEMS.map(({ to, href, labelKey, icon: Icon, end, expandable }) => {
            const content = (
              <>
                <Icon size={19} strokeWidth={2} />
                <span>{t(labelKey)}</span>
                {expandable && <ChevronDown className="nav-chevron" size={16} />}
              </>
            );

            if (href) {
              return (
                <a
                  key={labelKey}
                  className="admin-nav-item"
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noreferrer" : undefined}
                >
                  {content}
                </a>
              );
            }

            return (
              <NavLink
                key={to}
                to={to ?? "/admin"}
                end={end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => (isActive ? "admin-nav-item active" : "admin-nav-item")}
              >
                {content}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              className="top-icon admin-menu-btn"
              title={t("admin.topbar.openMenu")}
              aria-label={t("admin.topbar.openMenu")}
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="admin-brand">
              <button
                className="brand-menu"
                aria-label={t("admin.topbar.openMenu")}
                onClick={() => setSidebarOpen(true)}
              >
                <Menu size={21} />
              </button>
              <strong>NodeBeacon</strong>
              <span>Snapshot-{new Date(summary?.generatedAt ?? Date.now()).toLocaleString()} ({summary?.version ?? "dev"})</span>
            </div>
          </div>

          <div className="admin-topbar-actions">
            <button
              className="top-icon"
              title={t("admin.topbar.toggleTheme")}
              aria-label={t("admin.topbar.toggleTheme")}
              onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
            >
              {theme === "light" ? <Sun size={18} /> : <Moon size={18} />}
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
