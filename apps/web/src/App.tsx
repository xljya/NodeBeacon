import { Navigate, Routes, Route } from "react-router-dom";
import { StatusPage } from "./status/StatusPage";
import { NodeDetailPage } from "./status/NodeDetailPage";
import { LoginPage } from "./pages/LoginPage";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AdminLayout } from "./admin/AdminLayout";
import { NodesPage } from "./admin/pages/NodesPage";
import { SettingsPage } from "./admin/pages/SettingsPage";
import { AboutPage } from "./admin/pages/AboutPage";
import { LatencyPage } from "./admin/pages/LatencyPage";
import { AccountPage } from "./admin/pages/AccountPage";
import { SessionsPage } from "./admin/pages/SessionsPage";
import { LogsPage } from "./admin/pages/LogsPage";
import { NotificationPage } from "./admin/pages/NotificationPage";
import { ThemeSettingsPage } from "./admin/pages/ThemeSettingsPage";
import { RemoteExecPage } from "./admin/pages/RemoteExecPage";
import { ServerPage } from "./admin/pages/ServerPage";

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
          <Route index element={<ServerPage />} />
          <Route path="overview" element={<Navigate to="/admin?tab=overview" replace />} />
          <Route path="nodes" element={<ServerPage />} />
          <Route path="users" element={<Navigate to="/admin/account?tab=identity" replace />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/:section" element={<SettingsPage />} />
          <Route path="notification" element={<NotificationPage />} />
          <Route path="notification/:kind" element={<NotificationPage />} />
          <Route path="latency" element={<Navigate to="/admin/ping" replace />} />
          <Route path="ping" element={<LatencyPage />} />
          <Route path="exec" element={<RemoteExecPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="activity" element={<Navigate to="/admin/logs?tab=audit" replace />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="theme" element={<Navigate to="/admin/theme/default" replace />} />
          <Route path="theme/default" element={<ThemeSettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
