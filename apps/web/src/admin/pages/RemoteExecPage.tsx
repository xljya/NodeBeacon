import { Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";

export function RemoteExecPage() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("admin.remote.title")}</h2>
        <span className="page-sub">{t("admin.remote.subtitle")}</span>
      </div>
      <section className="section-panel">
        <div className="section-head">
          <div>
            <h3>{t("admin.remote.disabledTitle")}</h3>
            <p>{t("admin.remote.disabledText")}</p>
          </div>
          <Terminal size={20} />
        </div>
        <div className="admin-copy-note">{t("admin.remote.boundary")}</div>
      </section>
    </div>
  );
}
