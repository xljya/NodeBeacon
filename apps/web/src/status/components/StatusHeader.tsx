import { Link } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
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
        <span className="status-brand-main">◈ NodeBeacon</span>
        <span className="status-brand-sub">status</span>
      </Link>
      <div className="status-actions">
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
