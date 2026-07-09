import { ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";

export function LogsPage() {
  const { t } = useTranslation();
  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("admin.logs.title")}</h2>
        <span className="page-sub">{t("admin.logs.subtitle")}</span>
      </div>
      <section className="section-panel">
        <div className="section-head">
          <div>
            <h3>{t("admin.logs.runtimeTitle")}</h3>
            <p>{t("admin.logs.runtimeText")}</p>
          </div>
          <ScrollText size={20} />
        </div>
        <code className="selector block-selector">kubectl -n nodebeacon logs deploy/nodebeacon --tail=200</code>
      </section>
    </div>
  );
}
