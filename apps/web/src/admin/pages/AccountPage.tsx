import { LogOut, ShieldCheck, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { apiPost } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { PageError, PageLoading } from "../components/PageState";

export function AccountPage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi<{ user: typeof user; passwordLoginEnabled: boolean; githubLoginEnabled: boolean; totpEnabled: boolean; recoveryCodesRemaining: number }>("/api/admin/account");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [message, setMessage] = useState("");
  if (loading) return <PageLoading />;
  if (error || !data) return <PageError message={error ?? t("common.loadFailed")} />;

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>{t("admin.account.title")}</h2>
        <span className="page-sub">{t("admin.account.subtitle")}</span>
      </div>
      <section className="section-panel">
        <div className="section-head">
          <div>
            <h3>{data.user?.email ?? user?.email}</h3>
            <p>{t("admin.account.role", { role: user?.role ?? "owner" })}</p>
          </div>
          <ShieldCheck size={20} />
        </div>
        <button className="ghost-btn" onClick={handleLogout}>
          <LogOut size={15} /> {t("admin.topbar.logout")}
        </button>
      </section>
      <section className="section-panel">
        <div className="section-head"><div><h3>Password</h3><p>Change the Owner password stored in SQLite.</p></div><KeyRound size={20} /></div>
        <div className="settings-action-row"><input className="text-input" type="password" placeholder="Current password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /><input className="text-input" type="password" placeholder="New password (12+ characters)" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} /><button className="primary-btn" onClick={() => void apiPost("/api/admin/account/password", { currentPassword, nextPassword }).then(() => { setMessage("Password updated"); setCurrentPassword(""); setNextPassword(""); void reload(); }).catch((err: Error) => setMessage(err.message))}>Update</button></div>
        {message && <p className="page-sub">{message}</p>}
      </section>
      <section className="section-panel"><div className="section-head"><div><h3>Two-factor authentication</h3><p>{data.totpEnabled ? `Enabled · ${data.recoveryCodesRemaining} recovery codes remaining` : "Disabled"}</p></div><ShieldCheck size={20} /></div><TwoFactorControls enabled={data.totpEnabled} reload={reload} /></section>
    </div>
  );
}

function TwoFactorControls({ enabled, reload }: { enabled: boolean; reload: () => Promise<void> }) {
  const [secret, setSecret] = useState(""); const [code, setCode] = useState(""); const [codes, setCodes] = useState<string[]>([]); const [message, setMessage] = useState("");
  const setup = async () => { try { const result = await apiPost<{ secret: string }>("/api/admin/2fa/setup"); setSecret(result.secret); } catch (error) { setMessage(error instanceof Error ? error.message : "Setup failed"); } };
  const confirm = async () => { try { const result = await apiPost<{ recoveryCodes: string[] }>("/api/admin/2fa/confirm", { code }); setCodes(result.recoveryCodes); setMessage("TOTP enabled"); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Invalid code"); } };
  const disable = async () => { try { await apiPost("/api/admin/2fa/disable", { code }); setMessage("TOTP disabled"); setCode(""); await reload(); } catch (error) { setMessage(error instanceof Error ? error.message : "Invalid code"); } };
  return <div className="setting-list">{!enabled && <button className="primary-btn" onClick={() => void setup()}>Generate authenticator secret</button>}{secret && <div className="settings-action-row"><code className="selector">{secret}</code><input className="text-input" inputMode="numeric" placeholder="6-digit code" value={code} onChange={(event) => setCode(event.target.value)} /><button className="primary-btn" onClick={() => void confirm()}>Confirm</button></div>}{enabled && <div className="settings-action-row"><input className="text-input" inputMode="numeric" placeholder="6-digit code" value={code} onChange={(event) => setCode(event.target.value)} /><button className="ghost-btn" onClick={() => void disable()}>Disable TOTP</button></div>}{codes.length > 0 && <code className="selector block-selector">{codes.join("\n")}</code>}{message && <p className="page-sub">{message}</p>}</div>;
}
