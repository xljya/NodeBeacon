import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";

export function NotificationPage() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("admin.notification.title")}</h2>
        <span className="page-sub">{t("admin.notification.subtitle")}</span>
      </div>
      <section className="section-panel">
        <div className="section-head">
          <div>
            <h3>{t("admin.notification.currentTitle")}</h3>
            <p>{t("admin.notification.currentText")}</p>
          </div>
          <Bell size={20} />
        </div>
      </section>
    </div>
  );
}
