import { Routes, Route } from "react-router-dom";
import { PrototypePage } from "./pages/PrototypePage";
import { LoginPage } from "./pages/LoginPage";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AdminLayout } from "./admin/AdminLayout";
import { OverviewPage } from "./admin/pages/OverviewPage";
import { NodesPage } from "./admin/pages/NodesPage";
import { UsersPage } from "./admin/pages/UsersPage";
import { SettingsPage } from "./admin/pages/SettingsPage";

export function App() {
  return (
    <Routes>
      {/* Public status page stays the high-fidelity prototype (iframe). */}
      <Route path="/" element={<PrototypePage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* Owner-only admin console. */}
      <Route element={<ProtectedRoute />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="nodes" element={<NodesPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
