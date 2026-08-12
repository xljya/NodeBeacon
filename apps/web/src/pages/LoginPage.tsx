import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Github, Loader2, LogIn, Radar, ShieldCheck } from "lucide-react";
import type { AuthConfigResponse } from "@nodebeacon/shared";
import { useTranslation } from "react-i18next";
import { useAuth } from "../auth/AuthProvider";
import { apiGet, ApiError } from "../lib/api";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { useAppearance } from "../components/AppearanceProvider";
import "../admin/admin.css";

const ERROR_KEYS: Record<string, string> = {
  github_unbound: "login.err_github_unbound",
  github_failed: "login.err_github_failed",
  github_disabled: "login.err_github_disabled",
  challenge_expired: "login.err_challenge_expired",
  invalid_second_factor: "login.err_invalid_second_factor",
  invalid_credentials: "login.err_invalid_credentials"
};

export function LoginPage() {
  const { t } = useTranslation();
  const { user, loading, login, secondFactor, challengeRequired, cancelSecondFactor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState<AuthConfigResponse | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [step, setStep] = useState<"credentials" | "second-factor">("credentials");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { resolvedMode } = useAppearance();

  useEffect(() => {
    const codeFromRedirect = searchParams.get("error");
    if (codeFromRedirect) setError(t(ERROR_KEYS[codeFromRedirect] ?? "login.err_generic"));
    const redirectChallenge = searchParams.get("step") === "second-factor";
    void challengeRequired().then((required) => {
      if (redirectChallenge || required) setStep("second-factor");
    }).catch(() => undefined);
  }, [challengeRequired, searchParams, t]);

  useEffect(() => {
    void apiGet<AuthConfigResponse>("/api/auth/config")
      .then(setConfig)
      .catch(() => setConfig({ passwordLoginEnabled: true, githubLoginEnabled: false }));
  }, []);

  const from = (location.state as { from?: string } | null)?.from ?? "/admin";

  if (!loading && user?.role === "owner") return <Navigate to={from} replace />;

  const showError = (err: unknown) => {
    if (err instanceof ApiError && err.code && ERROR_KEYS[err.code]) {
      const key = ERROR_KEYS[err.code];
      if (key) setError(t(key));
      return;
    }
    setError(err instanceof Error ? err.message : t("login.err_generic"));
  };

  const handleCredentialsSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email.trim(), password);
      setPassword("");
      if (result === "second_factor_required") {
        setStep("second-factor");
        setCode("");
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSecondFactorSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await secondFactor(code.trim());
      navigate(from, { replace: true });
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const restart = async () => {
    await cancelSecondFactor().catch(() => undefined);
    setStep("credentials");
    setCode("");
    setPassword("");
    setError(null);
  };

  const passwordEnabled = config?.passwordLoginEnabled ?? true;
  const githubEnabled = config?.githubLoginEnabled ?? false;

  return (
    <div className="login-screen nb-komari-surface" data-theme={resolvedMode}>
      <div className="login-card">
        <div className="login-brand">
          <span className="login-logo" aria-hidden="true"><Radar size={26} strokeWidth={2.25} /></span>
          <div><h1>NodeBeacon</h1><p>{step === "second-factor" ? t("login.secondFactorSubtitle") : t("login.subtitle")}</p></div>
          <div className="login-lang"><LanguageSwitch /></div>
        </div>

        {error && <div className="login-error" role="alert">{error}</div>}

        {step === "credentials" && passwordEnabled && (
          <form className="login-form" onSubmit={handleCredentialsSubmit}>
            <label className="login-field"><span>{t("login.email")}</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
            <label className="login-field"><span>{t("login.password")}</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("login.passwordPlaceholder")} required /></label>
            <button className="login-submit" type="submit" disabled={submitting || !email || !password}><>{submitting ? <Loader2 className="spin" size={16} /> : <LogIn size={16} />}</>{submitting ? t("login.submitting") : t("login.submit")}</button>
          </form>
        )}

        {step === "second-factor" && (
          <form className="login-form" onSubmit={handleSecondFactorSubmit}>
            <div className="login-step-intro"><ShieldCheck size={22} /><p>{useRecoveryCode ? t("login.recoveryHelp") : t("login.authenticatorHelp")}</p></div>
            <label className="login-field"><span>{useRecoveryCode ? t("login.recoveryCode") : t("login.authenticatorCode")}</span><input autoFocus inputMode={useRecoveryCode ? "text" : "numeric"} autoComplete="one-time-code" maxLength={useRecoveryCode ? 32 : 6} pattern={useRecoveryCode ? undefined : "[0-9]{6}"} value={code} onChange={(event) => setCode(event.target.value)} placeholder={useRecoveryCode ? t("login.recoveryCodePlaceholder") : t("login.authenticatorCodePlaceholder")} required /></label>
            <button className="login-submit" type="submit" disabled={submitting || !code.trim()}>{submitting ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />}{submitting ? t("login.verifying") : t("login.verify")}</button>
            <button className="login-link-button" type="button" onClick={() => { setUseRecoveryCode((value) => !value); setCode(""); setError(null); }}>{useRecoveryCode ? t("login.useAuthenticator") : t("login.useRecoveryCode")}</button>
            <button className="login-link-button" type="button" onClick={() => void restart()}>{t("login.startOver")}</button>
          </form>
        )}

        {step === "credentials" && passwordEnabled && githubEnabled && <div className="login-divider"><span>{t("login.or")}</span></div>}
        {step === "credentials" && githubEnabled && <a className="login-github" href="/api/auth/github"><Github size={17} />{t("login.github")}</a>}
        {step === "credentials" && <a className="login-back" href="/">{t("login.back")}</a>}
      </div>
    </div>
  );
}
