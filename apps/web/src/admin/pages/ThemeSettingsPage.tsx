import { useState, type CSSProperties } from "react";
import { Palette, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  APPEARANCE_ACCENTS,
  APPEARANCE_GRAYS,
  APPEARANCE_MODES,
  APPEARANCE_PANELS,
  APPEARANCE_RADII,
  APPEARANCE_SCALINGS,
  type AppearanceTokensV1,
  type PublicThemePreset
} from "@nodebeacon/shared";
import { useAppearance } from "../../components/AppearanceProvider";
import { apiDelete, apiPatch, apiPost } from "../../lib/api";
import { useApi } from "../../lib/useApi";

export function ThemeSettingsPage() {
  const { t } = useTranslation();
  const { data, reload } = useApi<{ themes: PublicThemePreset[] }>("/api/admin/themes");
  const [name, setName] = useState("My theme"); const [json, setJson] = useState("{\n  \"version\": 1,\n  \"mode\": \"system\",\n  \"accent\": \"iris\",\n  \"grayColor\": \"slate\",\n  \"radius\": \"medium\",\n  \"scaling\": \"110%\",\n  \"panelBackground\": \"translucent\"\n}"); const [message, setMessage] = useState("");
  const create = async () => { try { await apiPost("/api/admin/themes", { name, tokens: JSON.parse(json), isDefault: false }); setMessage("Theme saved"); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Invalid JSON"); } };
  const exportTheme = (theme: { name: string; tokens: AppearanceTokensV1 }) => { const blob = new Blob([JSON.stringify({ name: theme.name, tokens: theme.tokens }, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${theme.name.replace(/[^a-z0-9_-]+/gi, "-")}.json`; link.click(); URL.revokeObjectURL(link.href); };
  const makeDefault = async (themeId: string) => { await apiPatch("/api/admin/settings/appearance", { themeId }); setMessage("Public default updated"); await reload(); };
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
      <section className="section-panel"><div className="section-head"><div><h3>Public default themes</h3><p>Only versioned, validated appearance tokens are stored; CSS, HTML and scripts are rejected.</p></div><Palette size={20} /></div><div className="settings-action-row"><input className="text-input" value={name} onChange={(event) => setName(event.target.value)} /><textarea className="text-input" value={json} onChange={(event) => setJson(event.target.value)} rows={8} /><button className="primary-btn" onClick={() => void create()}>Create</button></div><div className="setting-list">{data?.themes.map((theme) => <div className="setting-card flat" key={theme.id}><div className="setting-text"><h3>{theme.name} {theme.isDefault && <span className="pill pill-ok">Default</span>}</h3><p>{theme.tokens.mode} · {theme.tokens.accent} · {theme.tokens.scaling}</p></div><div className="settings-action-row"><button className="ghost-btn" onClick={() => exportTheme(theme)}>Export</button>{!theme.isDefault && <button className="ghost-btn" onClick={() => void makeDefault(theme.id)}>Set default</button>}{!theme.isDefault && <button className="ghost-btn" onClick={() => void apiDelete(`/api/admin/themes/${theme.id}`).then(() => void reload())}>Delete</button>}</div></div>)}</div>{message && <p className="page-sub">{message}</p>}</section>
    </div>
  );
}

export function AppearanceControls({ compact = false }: { compact?: boolean }) {
  const { appearance, updateAppearance, resetAppearance } = useAppearance();

  return (
    <div className={compact ? "appearance-controls compact" : "appearance-controls"}>
      <div className="appearance-row">
        <span>Mode</span>
        <div className="appearance-segment" role="group" aria-label="Admin theme">
          {APPEARANCE_MODES.map((mode) => <button key={mode} className={appearance.mode === mode ? "active" : ""} onClick={() => updateAppearance({ mode })}>{mode}</button>)}
        </div>
      </div>
      {!compact && <div className="appearance-row"><span>Gray scale</span><div className="appearance-segment">{APPEARANCE_GRAYS.map((grayColor) => <button key={grayColor} className={appearance.grayColor === grayColor ? "active" : ""} onClick={() => updateAppearance({ grayColor })}>{grayColor}</button>)}</div></div>}
      <div className="appearance-row">
        <span>Accent</span>
        <div className="accent-swatches" role="group" aria-label="Accent color">
          {APPEARANCE_ACCENTS.map((accent) => (
            <button
              key={accent}
              className={appearance.accent === accent ? "active" : ""}
              aria-label={`Use ${accent} accent`}
              title={accent}
              style={{ "--swatch": `var(--${accent}-9)` } as CSSProperties}
              onClick={() => updateAppearance({ accent })}
            />
          ))}
        </div>
      </div>
      {!compact && <div className="appearance-row"><span>Radius</span><div className="appearance-segment">{APPEARANCE_RADII.map((radius) => <button key={radius} className={appearance.radius === radius ? "active" : ""} onClick={() => updateAppearance({ radius })}>{radius}</button>)}</div></div>}
      {!compact && <div className="appearance-row"><span>Scaling</span><div className="appearance-segment">{APPEARANCE_SCALINGS.map((scaling) => <button key={scaling} className={appearance.scaling === scaling ? "active" : ""} onClick={() => updateAppearance({ scaling })}>{scaling}</button>)}</div></div>}
      {!compact && <div className="appearance-row"><span>Panels</span><div className="appearance-segment">{APPEARANCE_PANELS.map((panelBackground) => <button key={panelBackground} className={appearance.panelBackground === panelBackground ? "active" : ""} onClick={() => updateAppearance({ panelBackground })}>{panelBackground}</button>)}</div></div>}
      {!compact && (
        <button className="ghost-btn appearance-reset" onClick={resetAppearance}>
          <RotateCcw size={15} /> Reset appearance
        </button>
      )}
    </div>
  );
}
