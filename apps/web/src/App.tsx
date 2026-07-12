import { Routes, Route } from "react-router-dom";
import { StatusPage } from "./status/StatusPage";
import { NodeDetailPage } from "./status/NodeDetailPage";
import { LoginPage } from "./pages/LoginPage";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AdminLayout } from "./admin/AdminLayout";
import { OverviewPage } from "./admin/pages/OverviewPage";
import { NodesPage } from "./admin/pages/NodesPage";
import { UsersPage } from "./admin/pages/UsersPage";
import { SettingsPage } from "./admin/pages/SettingsPage";
import { AboutPage } from "./admin/pages/AboutPage";
import { ActivityPage } from "./admin/pages/ActivityPage";
import { LatencyPage } from "./admin/pages/LatencyPage";
import { AccountPage } from "./admin/pages/AccountPage";
import { SessionsPage } from "./admin/pages/SessionsPage";
import { LogsPage } from "./admin/pages/LogsPage";
import { NotificationPage } from "./admin/pages/NotificationPage";
import { ThemeSettingsPage } from "./admin/pages/ThemeSettingsPage";

export function App() {
  return (
    <Routes>
      {/* Public status page: native React dashboard driven by /api/status. */}
      <Route path="/" element={<StatusPage />} />
      {/* Node detail: header is public; trend charts require sign-in. */}
      <Route path="/nodes/:id" element={<NodeDetailPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Owner-only admin console. */}
      <Route element={<ProtectedRoute />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<NodesPage />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="nodes" element={<NodesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/:section" element={<SettingsPage />} />
          <Route path="notification" element={<NotificationPage />} />
          <Route path="notification/:kind" element={<NotificationPage />} />
          <Route path="latency" element={<LatencyPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="theme" element={<ThemeSettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
