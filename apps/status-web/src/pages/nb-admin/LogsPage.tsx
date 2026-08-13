import { Card, Flex, Tabs, Text } from "@radix-ui/themes";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminAuditEvent, AdminLogEntry } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";
import { useState } from "react";

const SOURCES = ["nodebeacon", "prometheus", "alertmanager", "blackbox", "loki"];

export default function LogsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "audit" ? "audit" : "runtime";
  const [source, setSource] = useState("nodebeacon");
  const logs = useAdminResource<{ entries: AdminLogEntry[] }>(`/api/admin/logs?source=${encodeURIComponent(source)}&limit=200`);
  const audit = useAdminResource<{ events: AdminAuditEvent[] }>("/api/admin/audit-events?limit=200");
  if ((tab === "runtime" && logs.loading) || (tab === "audit" && audit.loading)) return <AdminLoading />;
  if (tab === "runtime" && logs.error) return <AdminError message={logs.error} onRetry={() => void logs.reload()} />;
  if (tab === "audit" && audit.error) return <AdminError message={audit.error} onRetry={() => void audit.reload()} />;

  return (
    <AdminPage title={t("logs.title")} description={t("nb.logs.desc", "Runtime logs from fixed Loki selectors, plus Owner audit events.")}>
      <Tabs.Root value={tab} onValueChange={(value) => setParams(value === "audit" ? { tab: "audit" } : {})}>
        <Tabs.List>
          <Tabs.Trigger value="runtime">{t("nb.logs.runtime", "Runtime")}</Tabs.Trigger>
          <Tabs.Trigger value="audit">{t("nb.logs.audit", "Audit")}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="runtime">
          <Flex direction="column" gap="3" mt="3">
            <Flex gap="2" wrap="wrap">
              {SOURCES.map((item) => (
                <button key={item} className="rt-reset" onClick={() => setSource(item)}>
                  <Text weight={source === item ? "bold" : "regular"}>{item}</Text>
                </button>
              ))}
            </Flex>
            {(logs.data?.entries ?? []).map((entry, index) => (
              <Card key={`${entry.timestamp}-${index}`}>
                <Text size="1" color="gray">{entry.timestamp}</Text>
                <Text size="2" className="whitespace-pre-wrap">{entry.line}</Text>
              </Card>
            ))}
          </Flex>
        </Tabs.Content>
        <Tabs.Content value="audit">
          <Flex direction="column" gap="2" mt="3">
            {(audit.data?.events ?? []).map((event) => (
              <Card key={event.id}>
                <Flex justify="between" gap="3">
                  <Text>{event.action}</Text>
                  <Text size="2" color="gray">{new Date(event.timestamp).toLocaleString()}</Text>
                </Flex>
              </Card>
            ))}
          </Flex>
        </Tabs.Content>
      </Tabs.Root>
    </AdminPage>
  );
}
