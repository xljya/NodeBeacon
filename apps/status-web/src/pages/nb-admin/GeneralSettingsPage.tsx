import { Button, Card, Flex, Text } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { SettingCardShortTextInput } from "@/components/admin/SettingCard";
import { adminPatch, adminPost } from "@/lib/adminGateway";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminBackupStatus, GeneralSettings } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function GeneralSettingsPage() {
  const { t } = useTranslation();
  const settings = useAdminResource<GeneralSettings>("/api/admin/settings/general");
  const backup = useAdminResource<AdminBackupStatus>("/api/admin/backup/status");
  if (settings.loading || backup.loading) return <AdminLoading />;
  if (settings.error || backup.error || !settings.data) {
    return <AdminError message={settings.error ?? backup.error ?? "Unavailable"} onRetry={() => void Promise.all([settings.reload(), backup.reload()])} />;
  }
  const general = settings.data;
  const save = (patch: Partial<GeneralSettings>) => adminPatch<GeneralSettings>("/api/admin/settings/general", patch).then(() => settings.reload());

  return (
    <AdminPage title={t("settings.general.title")} description={t("nb.general.desc", "Cache and retention policy, plus backup request status.")}>
      <Flex direction="column" gap="3">
        <SettingCardShortTextInput title={t("nb.general.cache", "Status cache TTL (seconds)")} type="number" defaultValue={String(general.statusCacheTtlSeconds)} OnSave={(value) => save({ statusCacheTtlSeconds: Number(value) })} />
        <SettingCardShortTextInput title={t("nb.general.incidents", "Incident retention (days)")} type="number" defaultValue={String(general.incidentRetentionDays)} OnSave={(value) => save({ incidentRetentionDays: Number(value) })} />
        <SettingCardShortTextInput title={t("nb.general.audit", "Audit retention (days)")} type="number" defaultValue={String(general.auditRetentionDays)} OnSave={(value) => save({ auditRetentionDays: Number(value) })} />
        <SettingCardShortTextInput title={t("nb.general.exec", "Execution retention (days)")} type="number" defaultValue={String(general.executionRetentionDays)} OnSave={(value) => save({ executionRetentionDays: Number(value) })} />
        <Card>
          <Flex justify="between" align="center" gap="3" wrap="wrap">
            <Flex direction="column" gap="1">
              <Text weight="bold">{t("nb.general.backup", "Backup")}</Text>
              <Text size="2" color="gray">
                {t("nb.general.lastSuccess", "Last success")}: {backup.data?.lastSuccess ?? "—"}
              </Text>
            </Flex>
            <Button onClick={() => void adminPost("/api/admin/backup/run").then(() => backup.reload())}>
              {t("nb.general.requestBackup", "Request backup")}
            </Button>
          </Flex>
        </Card>
      </Flex>
    </AdminPage>
  );
}
