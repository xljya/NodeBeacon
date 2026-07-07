import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface StatVisibility {
  time: boolean;
  online: boolean;
  region: boolean;
  traffic: boolean;
  speed: boolean;
}

export type StatKey = keyof StatVisibility;

const KEYS: StatKey[] = ["time", "online", "region", "traffic", "speed"];

function useClock(): string {
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString());
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return clock;
}

function UpDown({ up, down }: { up: string; down: string }) {
  return (
    <>
      <span className="stat-up">↑</span> {up} <span className="stat-sep">/</span>{" "}
      <span className="stat-down">↓</span> {down}
    </>
  );
}

export function StatBar({
  onlineText,
  regions,
  trafficUp,
  trafficDown,
  speedUp,
  speedDown,
  cfg,
  onToggle
}: {
  onlineText: string;
  regions: number;
  trafficUp: string;
  trafficDown: string;
  speedUp: string;
  speedDown: string;
  cfg: StatVisibility;
  onToggle: (key: StatKey) => void;
}) {
  const { t } = useTranslation();
  const clock = useClock();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  return (
    <div className="stat-panel">
      <div className="stat-grid">
        {cfg.time && (
          <div className="stat-item">
            <span className="stat-label">{t("status.stats.time")}</span>
            <span className="stat-value">{clock}</span>
          </div>
        )}
        {cfg.online && (
          <div className="stat-item">
            <span className="stat-label">{t("status.stats.online")}</span>
            <span className="stat-value">{onlineText}</span>
          </div>
        )}
        {cfg.region && (
          <div className="stat-item">
            <span className="stat-label">{t("status.stats.region")}</span>
            <span className="stat-value">{regions}</span>
          </div>
        )}
        {cfg.traffic && (
          <div className="stat-item">
            <span className="stat-label">{t("status.stats.traffic")}</span>
            <span className="stat-value sm">
              <UpDown up={trafficUp} down={trafficDown} />
            </span>
          </div>
        )}
        {cfg.speed && (
          <div className="stat-item">
            <span className="stat-label">{t("status.stats.speed")}</span>
            <span className="stat-value sm">
              <UpDown up={speedUp} down={speedDown} />
            </span>
          </div>
        )}
      </div>

      <div className="stat-gear" ref={ref}>
        <button
          type="button"
          className="status-iconbtn"
          title={t("status.stats.settingsTitle")}
          onClick={() => setOpen((v) => !v)}
        >
          <Settings size={18} />
        </button>
        {open && (
          <div className="cfg-popover">
            <div className="cfg-title">{t("status.stats.settingsTitle")}</div>
            {KEYS.map((key) => (
              <div className="cfg-row" key={key}>
                <span>{t(`status.stats.${key}`)}</span>
                <button
                  type="button"
                  className={cfg[key] ? "cfg-switch on" : "cfg-switch"}
                  aria-pressed={cfg[key]}
                  onClick={() => onToggle(key)}
                >
                  <span className="cfg-knob" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
