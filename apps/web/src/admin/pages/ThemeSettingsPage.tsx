import { Palette } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ThemeSettingsPage() {
  const { t } = useTranslation();
  const theme = localStorage.getItem("nb-admin-theme") ?? "light";
  const accent = localStorage.getItem("nb-admin-accent") ?? "#2f6bff";
  const language = localStorage.getItem("nb-lang") ?? "auto";
  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("admin.theme.title")}</h2>
        <span className="page-sub">{t("admin.theme.subtitle")}</span>
      </div>
      <section className="section-panel">
        <div className="section-head">
          <div>
            <h3>{t("admin.theme.localTitle")}</h3>
            <p>{t("admin.theme.localText")}</p>
          </div>
          <Palette size={20} />
        </div>
        <div className="kv"><span>{t("admin.theme.adminTheme")}</span><b>{theme}</b></div>
        <div className="kv"><span>{t("admin.topbar.color")}</span><b>{accent}</b></div>
        <div className="kv"><span>{t("status.language")}</span><b>{language}</b></div>
      </section>
    </div>
  );
}
