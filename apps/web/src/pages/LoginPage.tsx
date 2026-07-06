import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Github, Loader2, LogIn } from "lucide-react";
import type { AuthConfigResponse } from "@nodebeacon/shared";
import { useAuth } from "../auth/AuthProvider";
import { apiGet } from "../lib/api";
import "../admin/admin.css";

const ERROR_MESSAGES: Record<string, string> = {
  github_unbound: "please log in and bind your external account first.",
  github_failed: "GitHub 登录失败，请重试。",
  github_disabled: "GitHub 登录未启用。"
};

export function LoginPage() {
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
    if (code) setError(ERROR_MESSAGES[code] ?? "登录失败");
  }, [searchParams]);

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
      setError(err instanceof Error ? err.message : "登录失败");
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
            <p>登录管理控制台</p>
          </div>
        </div>

        {error && <div className="login-error">{error}</div>}

        {passwordEnabled && (
          <form className="login-form" onSubmit={handleSubmit}>
            <label className="login-field">
              <span>账号（邮箱）</span>
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
              <span>密码</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                required
              />
            </label>

            <button className="login-submit" type="submit" disabled={submitting || !email || !password}>
              {submitting ? <Loader2 className="spin" size={16} /> : <LogIn size={16} />}
              {submitting ? "登录中…" : "登录"}
            </button>
          </form>
        )}

        {passwordEnabled && githubEnabled && <div className="login-divider"><span>或</span></div>}

        {githubEnabled && (
          <a className="login-github" href="/api/auth/github">
            <Github size={17} />
            使用 GitHub 登录
          </a>
        )}

        <a className="login-back" href="/">← 返回状态页</a>
      </div>
    </div>
  );
}
