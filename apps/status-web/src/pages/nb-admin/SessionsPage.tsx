import { Badge, Button, Card, Flex, Text } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { adminDelete } from "@/lib/adminGateway";
import { getLoginPath } from "@/lib/adminPaths";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminSession } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function SessionsPage() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useAdminResource<{ sessions: AdminSession[] }>("/api/admin/sessions");
  if (loading) return <AdminLoading />;
  if (error) return <AdminError message={error} onRetry={() => void reload()} />;

  const revoke = async (session: AdminSession) => {
    await adminDelete(`/api/admin/sessions/${session.id}`);
    if (session.current) {
      window.location.assign(getLoginPath());
      return;
    }
    await reload();
  };

  return (
    <AdminPage title={t("sessions.title")} description={t("nb.sessions.desc", "Review and revoke Owner sessions.")}>
      <Flex direction="column" gap="3">
        {(data?.sessions ?? []).map((session) => (
          <Card key={session.id}>
            <Flex justify="between" align="center" gap="3" wrap="wrap">
              <Flex direction="column">
                <Text weight="bold">{session.userAgent || session.id}</Text>
                <Text size="2" color="gray">{session.ipAddress || "—"} · {new Date(session.createdAt).toLocaleString()}</Text>
              </Flex>
              <Flex gap="2" align="center">
                {session.current ? <Badge color="green">{t("nb.sessions.current", "Current")}</Badge> : null}
                <Button color="red" variant="soft" onClick={() => void revoke(session)}>{t("nb.sessions.revoke", "Revoke")}</Button>
              </Flex>
            </Flex>
          </Card>
        ))}
      </Flex>
    </AdminPage>
  );
}
