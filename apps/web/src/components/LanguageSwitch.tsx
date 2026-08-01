import { useEffect, useRef, useState } from "react";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../i18n/config";

/** Language selector: globe button + popover menu, matching the status-page dropdown. */
export function LanguageSwitch() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Keep the document language aligned after a saved preference is restored
  // during initialization, including the first render after a page reload.
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = i18n.resolvedLanguage;

  const select = (code: string) => {
    void i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div className="lang-switch" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        title="Language"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Languages size={17} />
      </button>

      {open && (
        <ul className="lang-menu" role="listbox">
          {LANGUAGES.map((lng) => (
            <li key={lng.code}>
              <button
                type="button"
                role="option"
                aria-selected={current === lng.code}
                className={current === lng.code ? "lang-item active" : "lang-item"}
                onClick={() => select(lng.code)}
              >
                {lng.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
