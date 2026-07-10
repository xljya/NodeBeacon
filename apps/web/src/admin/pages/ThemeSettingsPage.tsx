import { useEffect, useState, type CSSProperties } from "react";
import { Palette, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ADMIN_ACCENTS,
  ADMIN_APPEARANCE_EVENT,
  getAdminAppearance,
  saveAdminAppearance,
  type AdminAppearance
} from "../../lib/adminAppearance";

export function ThemeSettingsPage() {
  const { t } = useTranslation();
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
        <AppearanceControls />
      </section>
    </div>
  );
}

export function AppearanceControls({ compact = false }: { compact?: boolean }) {
  const [appearance, setAppearance] = useState<AdminAppearance>(getAdminAppearance);

  useEffect(() => {
    const sync = () => setAppearance(getAdminAppearance());
    window.addEventListener(ADMIN_APPEARANCE_EVENT, sync);
    return () => window.removeEventListener(ADMIN_APPEARANCE_EVENT, sync);
  }, []);

  const update = (next: Partial<AdminAppearance>) => saveAdminAppearance(next);

  return (
    <div className={compact ? "appearance-controls compact" : "appearance-controls"}>
      <div className="appearance-row">
        <span>Mode</span>
        <div className="appearance-segment" role="group" aria-label="Admin theme">
          <button className={appearance.theme === "light" ? "active" : ""} onClick={() => update({ theme: "light" })}>Light</button>
          <button className={appearance.theme === "dark" ? "active" : ""} onClick={() => update({ theme: "dark" })}>Dark</button>
        </div>
      </div>
      <div className="appearance-row">
        <span>Accent</span>
        <div className="accent-swatches" role="group" aria-label="Accent color">
          {ADMIN_ACCENTS.map((accent) => (
            <button
              key={accent}
              className={appearance.accent === accent ? "active" : ""}
              aria-label={`Use ${accent} accent`}
              title={accent}
              style={{ "--swatch": accent } as CSSProperties}
              onClick={() => update({ accent })}
            />
          ))}
        </div>
      </div>
      {!compact && (
        <button className="ghost-btn appearance-reset" onClick={() => update({ theme: "light", accent: ADMIN_ACCENTS[0] })}>
          <RotateCcw size={15} /> Reset appearance
        </button>
      )}
    </div>
  );
}
