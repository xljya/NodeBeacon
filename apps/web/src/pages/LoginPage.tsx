import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Github, Loader2, LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AuthConfigResponse } from "@nodebeacon/shared";
import { useAuth } from "../auth/AuthProvider";
import { apiGet } from "../lib/api";
import { LanguageSwitch } from "../components/LanguageSwitch";
import "../admin/admin.css";

const ERROR_KEYS: Record<string, string> = {
  github_unbound: "login.err_github_unbound",
  github_failed: "login.err_github_failed",
  github_disabled: "login.err_github_disabled"
};

export function LoginPage() {
  const { t } = useTranslation();
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [config, setConfig] = useState<AuthConfigResponse | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Surface an error passed back from the GitHub OAuth redirect.
  useEffect(() => {
    const code = searchParams.get("error");
    if (code) setError(t(ERROR_KEYS[code] ?? "login.err_generic"));
  }, [searchParams, t]);

  useEffect(() => {
    apiGet<AuthConfigResponse>("/api/auth/config")
      .then(setConfig)
      .catch(() => setConfig({ passwordLoginEnabled: true, githubLoginEnabled: false }));
  }, []);

  const from = (location.state as { from?: string } | null)?.from ?? "/admin";

  if (!loading && user?.role === "owner") {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.err_generic"));
    } finally {
      setSubmitting(false);
    }
  };

  const passwordEnabled = config?.passwordLoginEnabled ?? true;
  const githubEnabled = config?.githubLoginEnabled ?? false;

  return (
    <div className="login-screen" data-theme="light">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-logo">◈</span>
          <div>
            <h1>NodeBeacon</h1>
            <p>{t("login.subtitle")}</p>
          </div>
          <div className="login-lang">
            <LanguageSwitch />
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        {passwordEnabled && (
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-field">
              <span>{t("login.email")}</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="login-field">
              <span>{t("login.password")}</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("login.passwordPlaceholder")}
                required
              />
            </label>

            <button className="login-submit" type="submit" disabled={submitting || !email || !password}>
              {submitting ? <Loader2 className="spin" size={16} /> : <LogIn size={16} />}
              {submitting ? t("login.submitting") : t("login.submit")}
            </button>
          </form>
        )}

        {passwordEnabled && githubEnabled && (
          <div className="login-divider">
            <span>{t("login.or")}</span>
          </div>
        )}

        {githubEnabled && (
          <a className="login-github" href="/api/auth/github">
            <Github size={17} />
            {t("login.github")}
          </a>
        )}

        <a className="login-back" href="/">
          {t("login.back")}
        </a>
      </div>
    </div>
  );
}
