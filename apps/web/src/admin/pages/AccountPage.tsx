import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { AdminAccountResponse, RecoveryCodesResponse, TotpConfirmationResponse, TotpSetupResponse } from "@nodebeacon/shared";
import { useAuth } from "../../auth/AuthProvider";
import { apiPost } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { PageError, PageLoading } from "../components/PageState";

export function AccountPage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi<AdminAccountResponse>("/api/admin/account");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [code, setCode] = useState("");
  const [managementCode, setManagementCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [savedCodes, setSavedCodes] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!setup?.otpauthUri) {
      setQrDataUrl("");
      return;
    }
    void QRCode.toDataURL(setup.otpauthUri, { errorCorrectionLevel: "M", margin: 2, width: 220 })
      .then(setQrDataUrl)
      .catch(() => setMessage(t("admin.account.qrFailed")));
  }, [setup, t]);

  if (loading) return <PageLoading />;
  if (error || !data) return <PageError message={error ?? t("common.loadFailed")} />;

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const updatePassword = async () => {
    try {
      await apiPost("/api/admin/account/password", { currentPassword, nextPassword });
      setMessage(t("admin.account.passwordUpdated"));
      setCurrentPassword("");
      setNextPassword("");
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : t("admin.account.actionFailed"));
    }
  };

  const beginSetup = async () => {
    try {
      const result = await apiPost<TotpSetupResponse>("/api/admin/2fa/setup", { currentPassword: setupPassword });
      setSetup(result);
      setSetupPassword("");
      setCode("");
      setMessage("");
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : t("admin.account.actionFailed"));
    }
  };

  const confirmSetup = async () => {
    try {
      const result = await apiPost<TotpConfirmationResponse>("/api/admin/2fa/confirm", { code });
      setRecoveryCodes(result.recoveryCodes);
      setSavedCodes(false);
      setSetup(null);
      setCode("");
      setMessage(t("admin.account.totpEnabled"));
      await reload();
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : t("admin.account.actionFailed"));
    }
  };

  const regenerateCodes = async () => {
    try {
      const result = await apiPost<RecoveryCodesResponse>("/api/admin/2fa/recovery-codes", { code: managementCode });
      setRecoveryCodes(result.recoveryCodes);
      setSavedCodes(false);
      setManagementCode("");
      setMessage(t("admin.account.recoveryCodesRegenerated"));
      await reload();
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : t("admin.account.actionFailed"));
    }
  };

  const disableTotp = async () => {
    try {
      await apiPost("/api/admin/2fa/disable", { code: managementCode });
      setManagementCode("");
      setMessage(t("admin.account.totpDisabled"));
      await reload();
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : t("admin.account.actionFailed"));
    }
  };

  const copyText = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setMessage(t("admin.account.copied"));
  };

  const downloadCodes = () => {
    const blob = new Blob([`${recoveryCodes.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "nodebeacon-recovery-codes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <div className="page-head"><h2>{t("admin.account.title")}</h2><span className="page-sub">{t("admin.account.subtitle")}</span></div>
      <section className="section-panel">
        <div className="section-head"><div><h3>{data.user?.email ?? user?.email}</h3><p>{t("admin.account.role", { role: user?.role ?? "owner" })}</p></div><ShieldCheck size={20} /></div>
        <button className="ghost-btn" onClick={() => void handleLogout()}><LogOut size={15} /> {t("admin.topbar.logout")}</button>
      </section>
      <section className="section-panel">
        <div className="section-head"><div><h3>{t("admin.account.passwordTitle")}</h3><p>{t("admin.account.passwordDescription")}</p></div><KeyRound size={20} /></div>
        <div className="settings-action-row"><input className="text-input" type="password" placeholder={t("admin.account.currentPassword")} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /><input className="text-input" type="password" placeholder={t("admin.account.newPassword")} value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} /><button className="primary-btn" onClick={() => void updatePassword()} disabled={!currentPassword || !nextPassword}>{t("admin.account.updatePassword")}</button></div>
      </section>
      <section className="section-panel">
        <div className="section-head"><div><h3>{t("admin.account.totpTitle")}</h3><p>{data.totpEnabled ? t("admin.account.totpStatusEnabled", { count: data.recoveryCodesRemaining }) : t("admin.account.totpStatusDisabled")}</p></div><ShieldCheck size={20} /></div>
        {!data.totpEnabled && !setup && <div className="settings-action-row"><input className="text-input" type="password" placeholder={t("admin.account.currentPassword")} value={setupPassword} onChange={(event) => setSetupPassword(event.target.value)} /><button className="primary-btn" onClick={() => void beginSetup()} disabled={!setupPassword}>{t("admin.account.beginSetup")}</button></div>}
        {setup && <div className="totp-setup"><div className="totp-setup-instructions"><h4>{t("admin.account.scanTitle")}</h4><p>{t("admin.account.scanDescription")}</p>{qrDataUrl ? <img className="totp-qr" src={qrDataUrl} alt={t("admin.account.qrAlt")} /> : <div className="totp-qr-placeholder" /> }<p className="page-sub">{t("admin.account.manualKey")}</p><div className="totp-secret-row"><code className="selector">{setup.secret}</code><button className="ghost-btn" onClick={() => void copyText(setup.secret)}><Copy size={14} />{t("admin.account.copy")}</button></div></div><div className="settings-action-row"><input className="text-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder={t("admin.account.confirmCode")} value={code} onChange={(event) => setCode(event.target.value)} /><button className="primary-btn" onClick={() => void confirmSetup()} disabled={!/^\d{6}$/.test(code)}>{t("admin.account.confirmSetup")}</button></div></div>}
        {data.totpEnabled && <div className="settings-action-row"><input className="text-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder={t("admin.account.currentAuthenticatorCode")} value={managementCode} onChange={(event) => setManagementCode(event.target.value)} /><button className="ghost-btn" onClick={() => void regenerateCodes()} disabled={!/^\d{6}$/.test(managementCode)}>{t("admin.account.regenerateCodes")}</button><button className="ghost-btn danger" onClick={() => void disableTotp()} disabled={!/^\d{6}$/.test(managementCode)}>{t("admin.account.disableTotp")}</button></div>}
        {recoveryCodes.length > 0 && <div className="recovery-codes"><h4>{t("admin.account.recoveryTitle")}</h4><p>{t("admin.account.recoveryDescription")}</p><code className="selector block-selector">{recoveryCodes.join("\n")}</code><div className="settings-action-row"><button className="ghost-btn" onClick={() => void copyText(recoveryCodes.join("\n"))}><Copy size={14} />{t("admin.account.copyAll")}</button><button className="ghost-btn" onClick={downloadCodes}><Download size={14} />{t("admin.account.download")}</button></div><label className="recovery-confirm"><input type="checkbox" checked={savedCodes} onChange={(event) => setSavedCodes(event.target.checked)} />{t("admin.account.savedCodes")}</label>{savedCodes && <button className="primary-btn" onClick={() => setRecoveryCodes([])}>{t("admin.account.done")}</button>}</div>}
        {message && <p className="page-sub" role="status">{message}</p>}
      </section>
    </div>
  );
}
