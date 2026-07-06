import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2, LogIn } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import "../admin/admin.css";

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? "/admin";

  // Already signed in → skip the form.
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

  return (
    <div className="login-screen" data-theme="light">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="login-logo">◈</span>
          <div>
            <h1>NodeBeacon</h1>
            <p>管理员登录</p>
          </div>
        </div>

        <label className="login-field">
          <span>邮箱</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@example.com"
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
            placeholder="••••••••"
            required
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button className="login-submit" type="submit" disabled={submitting || !email || !password}>
          {submitting ? <Loader2 className="spin" size={16} /> : <LogIn size={16} />}
          {submitting ? "登录中…" : "登录"}
        </button>

        <a className="login-back" href="/">← 返回状态页</a>
      </form>
    </div>
  );
}
