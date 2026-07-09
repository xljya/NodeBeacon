import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ExternalLink,
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
import { useAuth } from "../auth/AuthProvider";
import { LanguageSwitch } from "../components/LanguageSwitch";
import "./admin.css";

const NAV = [
  { to: "/admin", labelKey: "admin.nav.overview", icon: LayoutDashboard, end: true },
  { to: "/admin/nodes", labelKey: "admin.nav.nodes", icon: Server, end: false },
  { to: "/admin/users", labelKey: "admin.nav.users", icon: Users, end: false },
  { to: "/admin/settings", labelKey: "admin.nav.settings", icon: Settings, end: false }
];

type Theme = "light" | "dark";

export function AdminLayout() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
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
        </div>
        <nav className="admin-nav">
          {NAV.map(({ to, labelKey, icon: Icon, end }) => (
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
        </nav>
        <a className="admin-nav-item admin-nav-external" href="/">
          <ExternalLink size={17} />
          <span>{t("admin.nav.public")}</span>
        </a>
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
