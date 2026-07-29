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
import { apiDelete, apiPost } from "../../lib/api";
import { useApi } from "../../lib/useApi";

export function ThemeSettingsPage() {
  const { t } = useTranslation();
  const { data, reload } = useApi<{ themes: Array<{ id: string; name: string; tokens: Record<string, unknown>; isDefault: boolean }> }>("/api/admin/themes");
  const [name, setName] = useState("My theme"); const [json, setJson] = useState("{\n  \"accent\": \"#2f6bff\"\n}"); const [message, setMessage] = useState("");
  const create = async () => { try { await apiPost("/api/admin/themes", { name, tokens: JSON.parse(json), isDefault: false }); setMessage("Theme saved"); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Invalid JSON"); } };
  const exportTheme = (theme: { name: string; tokens: Record<string, unknown> }) => { const blob = new Blob([JSON.stringify({ name: theme.name, tokens: theme.tokens }, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${theme.name.replace(/[^a-z0-9_-]+/gi, "-")}.json`; link.click(); URL.revokeObjectURL(link.href); };
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
      <section className="section-panel"><div className="section-head"><div><h3>Public default themes</h3><p>Safe JSON design tokens are stored server-side; scripts and styles are never executed.</p></div><Palette size={20} /></div><div className="settings-action-row"><input className="text-input" value={name} onChange={(event) => setName(event.target.value)} /><textarea className="text-input" value={json} onChange={(event) => setJson(event.target.value)} rows={3} /><button className="primary-btn" onClick={() => void create()}>Create</button></div><div className="setting-list">{data?.themes.map((theme) => <div className="setting-card flat" key={theme.id}><div className="setting-text"><h3>{theme.name} {theme.isDefault && <span className="pill pill-ok">Default</span>}</h3></div><div className="settings-action-row"><button className="ghost-btn" onClick={() => exportTheme(theme)}>Export</button>{!theme.isDefault && <button className="ghost-btn" onClick={() => void apiDelete(`/api/admin/themes/${theme.id}`).then(() => void reload())}>Delete</button>}</div></div>)}</div>{message && <p className="page-sub">{message}</p>}</section>
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
