import { Navigate, Outlet, useLocation } from "react-router-dom";
import AdminPanelBar from "../../components/admin/AdminPanelBar";
import { AdminNavigationProvider } from "@/contexts/AdminNavigationContext";
import { useAccount } from "@/contexts/AccountContext";
import Loading from "@/components/loading";
import { getLoginPath, sanitizeNextPath } from "@/lib/adminPaths";

const AdminLayout = () => {
  const { account, loading } = useAccount();
  const location = useLocation();

  if (loading) return <Loading />;
  if (!account?.logged_in) {
    const next = sanitizeNextPath(`${location.pathname}${location.search}`);
    return (
      <Navigate
        to={`${getLoginPath()}?next=${encodeURIComponent(next)}`}
        replace
      />
    );
  }

  return (
    <AdminNavigationProvider>
      <AdminPanelBar content={<Outlet />} />
    </AdminNavigationProvider>
  );
};

export default AdminLayout;
