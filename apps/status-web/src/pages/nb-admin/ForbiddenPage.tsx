import { Button, Flex, Text } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { withAdminBase } from "@/lib/adminPaths";
import { AdminPage } from "./AdminPage";

export default function ForbiddenPage() {
  const { t } = useTranslation();
  return (
    <AdminPage title={t("nb.forbidden.title", "Not allowed")}>
      <Flex direction="column" gap="3" align="start">
        <Text size="2" color="gray">
          {t("nb.forbidden.desc", "This Owner action is not permitted for the current session.")}
        </Text>
        <Button asChild>
          <Link to={withAdminBase("/admin/dashboard")}>{t("common.dashboard")}</Link>
        </Button>
      </Flex>
    </AdminPage>
  );
}
