import { Badge, Card, Flex, Text } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminAccountResponse } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function SignOnPage() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useAdminResource<AdminAccountResponse>("/api/admin/account");
  if (loading) return <AdminLoading />;
  if (error || !data) return <AdminError message={error ?? "Unavailable"} onRetry={() => void reload()} />;

  return (
    <AdminPage
      title={t("settings.sign_on.title")}
      description={t("nb.signon.desc", "Login methods and Owner identity. Secret values stay on the server and are never shown here.")}
    >
      <Flex direction="column" gap="3">
        <StatusCard title={t("nb.signon.owner", "Owner identity")} value={data.user?.email ?? "owner"} hint={data.user?.role ?? "owner"} ok={Boolean(data.user)} />
        <StatusCard title={t("nb.signon.password", "Password login")} value={data.passwordLoginEnabled ? "enabled" : "disabled"} ok={data.passwordLoginEnabled} />
        <StatusCard title={t("login.login_with_github")} value={data.githubLoginEnabled ? "enabled" : "disabled"} ok={data.githubLoginEnabled} />
        <StatusCard title={t("login.two_factor")} value={data.totpEnabled ? "enabled" : "disabled"} ok={data.totpEnabled} />
        <Card>
          <Text size="2" color="gray">
            {t("nb.signon.secrets", "GitHub client credentials, cookie secrets and encryption keys are configured on the server. This page is read-only.")}
          </Text>
        </Card>
      </Flex>
    </AdminPage>
  );
}

function StatusCard({ title, value, hint, ok }: { title: string; value: string; hint?: string; ok: boolean }) {
  return (
    <Card>
      <Flex justify="between" align="center" gap="3">
        <Flex direction="column" gap="1">
          <Text weight="bold">{title}</Text>
          {hint ? <Text size="2" color="gray">{hint}</Text> : null}
        </Flex>
        <Badge color={ok ? "green" : "gray"}>{value}</Badge>
      </Flex>
    </Card>
  );
}
