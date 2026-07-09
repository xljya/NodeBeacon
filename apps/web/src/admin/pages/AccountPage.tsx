import { LogOut, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";

export function AccountPage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("admin.account.title")}</h2>
        <span className="page-sub">{t("admin.account.subtitle")}</span>
      </div>
      <section className="section-panel">
        <div className="section-head">
          <div>
            <h3>{user?.email}</h3>
            <p>{t("admin.account.role", { role: user?.role ?? "owner" })}</p>
          </div>
          <ShieldCheck size={20} />
        </div>
        <button className="ghost-btn" onClick={handleLogout}>
          <LogOut size={15} /> {t("admin.topbar.logout")}
        </button>
      </section>
    </div>
  );
}
