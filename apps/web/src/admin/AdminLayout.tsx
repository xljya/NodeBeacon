import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Moon,
  Server,
  Settings,
  Sun,
  Users
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import "./admin.css";

const NAV = [
  { to: "/admin", label: "总览", icon: LayoutDashboard, end: true },
  { to: "/admin/nodes", label: "节点", icon: Server, end: false },
  { to: "/admin/users", label: "用户", icon: Users, end: false },
  { to: "/admin/settings", label: "设置", icon: Settings, end: false }
];

type Theme = "light" | "dark";

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-logo">◈</span> NodeBeacon
        </div>
        <nav className="admin-nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => (isActive ? "admin-nav-item active" : "admin-nav-item")}
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <a className="admin-nav-item admin-nav-external" href="/">
          <ExternalLink size={17} />
          <span>公开状态页</span>
        </a>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-title">管理后台</div>
          <div className="admin-topbar-actions">
            <button
              className="icon-btn"
              title="切换主题"
              onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <span className="admin-user" title={user?.email}>
              {user?.email}
            </span>
            <button className="ghost-btn" onClick={handleLogout}>
              <LogOut size={15} /> 登出
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
