import { Card, Flex, Text } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { useAdminResource } from "@/lib/useAdminResource";
import type { AdminSummaryResponse } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function AboutPage() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useAdminResource<AdminSummaryResponse>("/api/admin/summary");
  if (loading) return <AdminLoading />;
  if (error || !data) return <AdminError message={error ?? "Unavailable"} onRetry={() => void reload()} />;

  return (
    <AdminPage title={t("common.about")} description={t("nb.about.desc", "Version, data plane, security boundary and repository provenance.")}>
      <Flex direction="column" gap="3">
        <Fact title={t("nb.about.product", "Product")} value={`NodeBeacon v${data.version}`} hint={t("nb.about.productHint", "Single-container Fastify BFF on RS1000 k3s.")} />
        <Fact title={t("nb.about.data", "Data plane")} value="Prometheus + SQLite" hint={t("nb.about.dataHint", "Queries stay on the server. The browser never talks to Prometheus, RPC2 or a Komari Agent.")} />
        <Fact title={t("nb.about.security", "Security boundary")} value={t("nb.about.ownerOnly", "Owner cookie + Origin/CSRF")} hint={t("nb.about.securityHint", "Themes are AppearanceTokensV1 only. Remote exec is not on the Owner menu. No WebSSH, plugin market or theme ZIP.")} />
        <Fact title={t("nb.about.source", "Source")} value="xljya/NodeBeacon + xljya/NodeBeacon-Web" hint={t("nb.about.sourceHint", "Komari Web shell provenance is preserved. The fork is not a license conclusion.")} />
      </Flex>
    </AdminPage>
  );
}

function Fact({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <Card>
      <Flex direction="column" gap="1">
        <Text size="2" color="gray">{title}</Text>
        <Text weight="bold">{value}</Text>
        <Text size="2" color="gray">{hint}</Text>
      </Flex>
    </Card>
  );
}
