import { useState } from "react";
import { Button, Flex } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { SettingCardSelect, SettingCardShortTextInput } from "@/components/admin/SettingCard";
import { adminPatch } from "@/lib/adminGateway";
import { useAdminResource } from "@/lib/useAdminResource";
import type { SiteSettings } from "@/lib/contracts";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

export default function SiteSettingsPage() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useAdminResource<SiteSettings>("/api/admin/settings/site");
  const [draft, setDraft] = useState<SiteSettings | null>(null);
  const site = draft ?? data;
  if (loading) return <AdminLoading />;
  if (error || !site) return <AdminError message={error ?? "Unavailable"} onRetry={() => void reload()} />;

  const save = async (patch: Partial<SiteSettings>) => {
    const next = await adminPatch<SiteSettings>("/api/admin/settings/site", patch);
    setDraft(next);
  };

  return (
    <AdminPage title={t("settings.site.title")} description={t("nb.site.desc", "Public site name, description, language and timezone.")}>
      <Flex direction="column" gap="3">
        <SettingCardShortTextInput
          title={t("nb.site.name", "Site name")}
          defaultValue={site.name}
          OnSave={(value) => save({ name: String(value) })}
        />
        <SettingCardShortTextInput
          title={t("nb.site.description", "Description")}
          defaultValue={site.description}
          OnSave={(value) => save({ description: String(value) })}
        />
        <SettingCardSelect
          title={t("nb.site.locale", "Default language")}
          defaultValue={site.defaultLocale}
          options={[
            { label: "English", value: "en" },
            { label: "简体中文", value: "zh-CN" },
            { label: "繁體中文", value: "zh-TW" },
          ]}
          OnSave={(value) => save({ defaultLocale: value as SiteSettings["defaultLocale"] })}
        />
        <SettingCardShortTextInput
          title={t("nb.site.timezone", "Timezone")}
          defaultValue={site.timezone}
          OnSave={(value) => save({ timezone: String(value) })}
        />
        <Button variant="soft" onClick={() => void reload()}>
          {t("common.refresh", "Refresh")}
        </Button>
      </Flex>
    </AdminPage>
  );
}
