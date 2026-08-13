import { useState } from "react";
import { Button, Card, Flex, Tabs, Text, TextField } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { adminPost } from "@/lib/adminGateway";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminAccountResponse, TotpSetupResponse } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";
import { useSearchParams } from "react-router-dom";

export default function AccountPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data, error, loading, reload } = useAdminResource<AdminAccountResponse>("/api/admin/account");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const tab = params.get("tab") === "identity" ? "identity" : "security";
  if (loading) return <AdminLoading />;
  if (error || !data) return <AdminError message={error ?? "Unavailable"} onRetry={() => void reload()} />;

  return (
    <AdminPage title={t("account.title")} description={t("nb.account.desc", "Password, TOTP and recovery codes for the Owner account.")}>
      <Tabs.Root value={tab} onValueChange={(value) => setParams(value === "identity" ? { tab: "identity" } : {})}>
        <Tabs.List>
          <Tabs.Trigger value="security">{t("nb.account.security", "Security")}</Tabs.Trigger>
          <Tabs.Trigger value="identity">{t("nb.account.identity", "Identity")}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="identity">
          <Card mt="3">
            <Flex direction="column" gap="1">
              <Text weight="bold">{data.user?.email ?? "owner"}</Text>
              <Text size="2" color="gray">{data.user?.role ?? "owner"}</Text>
            </Flex>
          </Card>
        </Tabs.Content>
        <Tabs.Content value="security">
          <Flex direction="column" gap="3" mt="3">
            <Card>
              <Flex direction="column" gap="2">
                <Text weight="bold">{t("account.change_password_title")}</Text>
                <TextField.Root type="password" placeholder={t("account.new_password")} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} aria-label="Current password" />
                <TextField.Root type="password" placeholder={t("account.new_password_repeat")} value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} aria-label="New password" />
                <Button onClick={() => void adminPost("/api/admin/account/password", { currentPassword, nextPassword }).then(() => { setCurrentPassword(""); setNextPassword(""); })}>
                  {t("account.change_password_button")}
                </Button>
              </Flex>
            </Card>
            <Card>
              <Flex direction="column" gap="2">
                <Text weight="bold">{t("login.two_factor")}</Text>
                <Text size="2" color="gray">
                  {data.totpEnabled
                    ? t("account.2fa_enabled")
                    : t("account.2fa_disabled")}
                  {` · ${data.recoveryCodesRemaining} recovery codes`}
                </Text>
                {!data.totpEnabled && !setup ? (
                  <>
                    <TextField.Root type="password" placeholder={t("login.password")} value={setupPassword} onChange={(event) => setSetupPassword(event.target.value)} aria-label="Current password for 2FA" />
                    <Button onClick={() => void adminPost<TotpSetupResponse>("/api/admin/2fa/setup", { currentPassword: setupPassword }).then(setSetup)}>
                      {t("account.enable_2fa")}
                    </Button>
                  </>
                ) : null}
                {setup ? (
                  <>
                    <Text size="2">{setup.secret}</Text>
                    <Text size="1" color="gray">{setup.otpauthUri}</Text>
                    <TextField.Root value={code} onChange={(event) => setCode(event.target.value)} aria-label={t("login.authenticator_code", "Authenticator code")} />
                    <Button onClick={() => void adminPost<{ recoveryCodes: string[] }>("/api/admin/2fa/confirm", { code }).then((result) => { setRecoveryCodes(result.recoveryCodes); setSetup(null); void reload(); })}>
                      {t("nb.account.confirm", "Confirm")}
                    </Button>
                  </>
                ) : null}
                {data.totpEnabled ? (
                  <>
                    <TextField.Root value={code} onChange={(event) => setCode(event.target.value)} aria-label={t("login.authenticator_code", "Authenticator code")} />
                    <Button variant="soft" onClick={() => void adminPost<{ recoveryCodes: string[] }>("/api/admin/2fa/recovery-codes", { code }).then((result) => setRecoveryCodes(result.recoveryCodes))}>
                      {t("nb.account.regenerate", "Regenerate recovery codes")}
                    </Button>
                    <Button color="red" variant="soft" onClick={() => void adminPost("/api/admin/2fa/disable", { code }).then(() => reload())}>
                      {t("account.disable_2fa")}
                    </Button>
                  </>
                ) : null}
                {recoveryCodes.length > 0 ? (
                  <Text size="2">{recoveryCodes.join(" ")}</Text>
                ) : null}
              </Flex>
            </Card>
          </Flex>
        </Tabs.Content>
      </Tabs.Root>
    </AdminPage>
  );
}
