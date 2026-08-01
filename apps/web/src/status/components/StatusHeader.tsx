import { Link } from "react-router-dom";
import { Github, Moon, Radar, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LanguageSwitch } from "../../components/LanguageSwitch";

type Theme = "light" | "dark";

export function StatusHeader({
  theme,
  onToggleTheme
}: {
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const { t } = useTranslation();
  return (
    <header className="status-header">
      <Link to="/" className="status-brand">
        <span className="status-brand-main">
          <Radar size={20} strokeWidth={2.25} aria-hidden="true" />
          NodeBeacon
        </span>
        <span className="status-brand-sub">status</span>
      </Link>
      <div className="status-actions">
        <a
          href="https://github.com/xljya/NodeBeacon"
          className="status-iconbtn"
          title="GitHub"
          aria-label="GitHub"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={18} aria-hidden="true" />
        </a>
        <button
          type="button"
          className="status-iconbtn"
          title={t("status.theme")}
          onClick={onToggleTheme}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <LanguageSwitch />
        <Link to="/login" className="status-login">
          {t("status.header.login")}
        </Link>
      </div>
    </header>
  );
}
