import { Cookie, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";

export function SessionsPage() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("admin.sessions.title")}</h2>
        <span className="page-sub">{t("admin.sessions.subtitle")}</span>
      </div>
      <div className="card-grid dense">
        <section className="card">
          <div className="card-title"><Cookie size={16} /> {t("admin.sessions.cookieTitle")}</div>
          <p className="metric-sub">{t("admin.sessions.cookieText")}</p>
        </section>
        <section className="card">
          <div className="card-title"><Shield size={16} /> {t("admin.sessions.guardTitle")}</div>
          <p className="metric-sub">{t("admin.sessions.guardText")}</p>
        </section>
      </div>
    </div>
  );
}
