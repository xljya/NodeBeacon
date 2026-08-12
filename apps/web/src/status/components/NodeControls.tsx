import { useEffect, useRef } from "react";
import { LayoutGrid, List, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

export type ViewMode = "grid" | "table";

export function NodeControls({
  query,
  onQuery,
  view,
  onView,
  groups,
  group,
  onGroup
}: {
  query: string;
  onQuery: (v: string) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  groups: string[];
  group: string;
  onGroup: (g: string) => void;
}) {
  const { t } = useTranslation();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === "Escape" && document.activeElement === searchRef.current) {
        onQuery("");
        searchRef.current?.blur();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onQuery]);
  return (
    <>
      <div className="status-controls">
        <div className="search-box">
          <Search size={18} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t("status.controls.searchPlaceholder")}
          />
          <kbd className="search-shortcut" aria-hidden="true">/</kbd>
        </div>
        <div className="view-wrap">
          <span className="view-label">{t("status.controls.viewMode")}</span>
          <div className="seg">
            <button
              type="button"
              className={view === "grid" ? "seg-btn active" : "seg-btn"}
              title={t("status.controls.grid")}
              onClick={() => onView("grid")}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              type="button"
              className={view === "table" ? "seg-btn active" : "seg-btn"}
              title={t("status.controls.table")}
              onClick={() => onView("table")}
            >
              <List size={17} />
            </button>
          </div>
        </div>
      </div>

      <div className="group-tabs">
        <span className="group-label">{t("status.controls.group")}</span>
        <div className="seg">
          {groups.map((g) => (
            <button
              type="button"
              key={g}
              className={group === g ? "tab-btn active" : "tab-btn"}
              onClick={() => onGroup(g)}
            >
              {g === "All" ? t("status.controls.all") : g}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
