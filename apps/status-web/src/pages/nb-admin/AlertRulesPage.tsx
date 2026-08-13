import { useState } from "react";
import { Button, Card, Flex, Switch, Text, TextField } from "@radix-ui/themes";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { adminDelete, adminPatch, adminPost } from "@/lib/adminGateway";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AlertRule } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function AlertRulesPage() {
  const { t } = useTranslation();
  const type = useLocation().pathname.endsWith("/load") ? "load" : "offline";
  const { data, error, loading, reload } = useAdminResource<{ rules: AlertRule[] }>("/api/admin/alert-rules");
  const [name, setName] = useState(type === "load" ? "Load rule" : "Offline rule");
  if (loading) return <AdminLoading />;
  if (error) return <AdminError message={error} onRetry={() => void reload()} />;
  const rules = (data?.rules ?? []).filter((rule) => rule.type === type);

  return (
    <AdminPage
      title={type === "load" ? t("notification.load.title") : t("notification.offline.title")}
      description={t("nb.rules.desc", "Create and update NodeBeacon alert rules. PromQL stays on the server.")}
    >
      <Flex direction="column" gap="3">
        <Flex gap="2">
          <TextField.Root value={name} onChange={(event) => setName(event.target.value)} />
          <Button onClick={() => void adminPost("/api/admin/alert-rules", { name, type, config: {}, channelIds: [], enabled: true }).then(() => reload())}>
            {t("common.add", "Add")}
          </Button>
        </Flex>
        {rules.map((rule) => (
          <Card key={rule.id}>
            <Flex justify="between" align="center" gap="3">
              <Flex direction="column">
                <Text weight="bold">{rule.name}</Text>
                <Text size="2" color="gray">{rule.reconcileStatus}{rule.reconcileError ? ` · ${rule.reconcileError}` : ""}</Text>
              </Flex>
              <Flex gap="2" align="center">
                <Switch checked={rule.enabled} onCheckedChange={(checked) => void adminPatch(`/api/admin/alert-rules/${rule.id}`, { enabled: Boolean(checked) }).then(() => reload())} />
                <Button color="red" variant="soft" onClick={() => void adminDelete(`/api/admin/alert-rules/${rule.id}`).then(() => reload())}>{t("common.delete")}</Button>
              </Flex>
            </Flex>
          </Card>
        ))}
      </Flex>
    </AdminPage>
  );
}
