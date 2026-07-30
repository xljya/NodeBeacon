import { useEffect, useRef, useState, type CSSProperties } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  AtSign,
  BarChart3,
  Bell,
  BookOpen,
  Code2,
  ChevronDown,
  CircleUserRound,
  Database,
  Droplet,
  Ellipsis,
  FileText,
  Globe2,
  Home,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Palette,
  Radar,
  Server,
  Settings,
  Sun,
  Terminal,
  TrendingUp,
  Unplug,
  Users,
  type LucideIcon
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
  icon: LucideIcon;
}

interface AdminNavLink {
  kind: "link";
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

interface AdminNavGroup {
  kind: "group";
  id: "settings" | "notification";
  label: string;
  icon: LucideIcon;
  items: NestedNavItem[];
}

interface AdminNavExternalLink {
  kind: "external";
  href: string;
  label: string;
  icon: LucideIcon;
}

type AdminNavEntry = AdminNavLink | AdminNavGroup | AdminNavExternalLink;

const ADMIN_NAV: AdminNavEntry[] = [
  { kind: "link", to: "/admin", end: true, label: "server", icon: Server },
  { kind: "link", to: "/admin/overview", label: "overview", icon: BarChart3 },
  {
    kind: "group",
    id: "settings",
    label: "settings",
    icon: Settings,
    items: [
      { to: "/admin/settings/site", label: "site", icon: Home },
      { to: "/admin/settings/theme", label: "theme", icon: Palette },
      { to: "/admin/settings/sign-on", label: "signOn", icon: LogIn },
      { to: "/admin/settings/notifications", label: "notifications", icon: MessageCircle },
      { to: "/admin/settings/general", label: "general", icon: Ellipsis },
      { to: "/admin/settings/xtermjs", label: "xtermjs", icon: Terminal },
      { to: "/admin/settings/reverse-proxy", label: "reverseProxy", icon: Globe2 },
      { to: "/admin/settings/metrics", label: "metrics", icon: Database }
    ]
  },
  {
    kind: "group",
    id: "notification",
    label: "notification",
    icon: Bell,
    items: [
      { to: "/admin/notification/offline", label: "offline", icon: Unplug },
      { to: "/admin/notification/load", label: "load", icon: TrendingUp },
      { to: "/admin/notification/traffic-report", label: "trafficReport", icon: BarChart3 },
      { to: "/admin/notification/general", label: "general", icon: Ellipsis }
    ]
  },
  { kind: "link", to: "/admin/exec", label: "remoteExec", icon: Code2 },
  { kind: "link", to: "/admin/ping", label: "latency", icon: Activity },
  { kind: "link", to: "/admin/sessions", label: "sessions", icon: Users },
  { kind: "link", to: "/admin/account", label: "account", icon: CircleUserRound },
  { kind: "link", to: "/admin/logs", label: "logs", icon: FileText },
  { kind: "link", to: "/admin/about", label: "about", icon: AtSign },
  {
    kind: "external",
    href: "https://github.com/xljya/NodeBeacon/blob/main/docs/development-plan.md",
    label: "documentation",
    icon: BookOpen
  },
  { kind: "external", href: "/", label: "home", icon: Home },
  { kind: "link", to: "/admin/theme", label: "defaultTheme", icon: Palette }
];

export function AdminLayout() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { data: summary } = useApi<AdminSummaryResponse>("/api/admin/summary");
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarTriggerRef = useRef<HTMLButtonElement>(null);
  const [appearance, setAppearance] = useState<AdminAppearance>(getAdminAppearance);
  const [settingsOpen, setSettingsOpen] = useState(() => location.pathname.startsWith("/admin/settings"));
  const [notificationOpen, setNotificationOpen] = useState(() => location.pathname.startsWith("/admin/notification"));

  useEffect(() => {
    const syncAppearance = () => setAppearance(getAdminAppearance());
    window.addEventListener(ADMIN_APPEARANCE_EVENT, syncAppearance);
    return () => window.removeEventListener(ADMIN_APPEARANCE_EVENT, syncAppearance);
  }, []);

  useEffect(() => {
    const inSettings = location.pathname.startsWith("/admin/settings");
    const inNotification = location.pathname.startsWith("/admin/notification");
    setSettingsOpen(inSettings);
    setNotificationOpen(inNotification);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarOpen) {
      if (window.matchMedia("(max-width: 900px)").matches) sidebarTriggerRef.current?.focus();
      return;
    }

    if (!window.matchMedia("(max-width: 900px)").matches) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const firstFocusable = sidebarRef.current?.querySelector<HTMLElement>("a, button");
    firstFocusable?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sidebarOpen]);

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

      <aside ref={sidebarRef} className={sidebarOpen ? "admin-sidebar open" : "admin-sidebar"}>
        <nav className="admin-nav komari-nav" aria-label={t("admin.topbar.title")}>
          {ADMIN_NAV.map((entry) => {
            if (entry.kind === "group") {
              const open = entry.id === "settings" ? settingsOpen : notificationOpen;
              return (
                <NestedNavGroup
                  key={entry.id}
                  id={entry.id}
                  icon={entry.icon}
                  label={t(`admin.nav.${entry.label}`)}
                  open={open}
                  onToggle={() => (entry.id === "settings" ? setSettingsOpen((value) => !value) : setNotificationOpen((value) => !value))}
                  onNavigate={() => setSidebarOpen(false)}
                  items={entry.items.map((item) => ({ ...item, label: t(`admin.nav.${item.label}`) }))}
                />
              );
            }
            if (entry.kind === "external") {
              return (
                <a key={entry.label} className="admin-nav-item" href={entry.href} {...(entry.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})} onClick={() => setSidebarOpen(false)}>
                  <entry.icon size={16} strokeWidth={2} />
                  <span>{t(`admin.nav.${entry.label}`)}</span>
                </a>
              );
            }
            return <AdminLink key={entry.to} {...entry} label={t(`admin.nav.${entry.label}`)} onNavigate={() => setSidebarOpen(false)} />;
          })}
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button ref={sidebarTriggerRef} className="top-icon admin-menu-btn" title={t("admin.topbar.openMenu")} aria-label={t("admin.topbar.openMenu")} onClick={() => setSidebarOpen(true)}>
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

function AdminLink({ to, icon: Icon, label, end = false, onNavigate }: { to: string; icon: LucideIcon; label: string; end?: boolean; onNavigate: () => void }) {
  return (
    <NavLink to={to} end={end} onClick={onNavigate} className={({ isActive }) => (isActive ? "admin-nav-item active" : "admin-nav-item")}>
      <Icon size={16} strokeWidth={2} />
      <span>{label}</span>
    </NavLink>
  );
}

function NestedNavGroup({ id, icon: Icon, label, open, onToggle, onNavigate, items }: { id: string; icon: LucideIcon; label: string; open: boolean; onToggle: () => void; onNavigate: () => void; items: NestedNavItem[] }) {
  return (
    <section className="admin-nav-group">
      <button type="button" className={open ? "admin-nav-item nav-group-toggle open" : "admin-nav-item nav-group-toggle"} aria-expanded={open} aria-controls={`admin-nav-${id}`} onClick={onToggle}>
        <Icon size={16} strokeWidth={2} />
        <span>{label}</span>
        <ChevronDown className="nav-chevron" size={16} aria-hidden="true" />
      </button>
      {open && (
        <div id={`admin-nav-${id}`} className="admin-nav-nested">
          {items.map(({ to, label: childLabel, icon: ChildIcon }) => (
            <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => (isActive ? "admin-nav-item admin-nav-child active" : "admin-nav-item admin-nav-child")}>
              <ChildIcon size={16} strokeWidth={2} />
              <span>{childLabel}</span>
            </NavLink>
          ))}
        </div>
      )}
    </section>
  );
}
