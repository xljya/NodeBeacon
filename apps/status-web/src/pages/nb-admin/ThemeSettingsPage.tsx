import { useState } from "react";
import { Badge, Button, Card, Flex, Text, TextArea, TextField } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  APPEARANCE_ACCENTS,
  APPEARANCE_GRAYS,
  APPEARANCE_MODES,
  APPEARANCE_PANELS,
  APPEARANCE_RADII,
  APPEARANCE_SCALINGS,
  type AppearanceTokensV1,
  type PublicThemePreset,
} from "@/lib/contracts";
import { adminDelete, adminPatch, adminPost } from "@/lib/adminGateway";
import ConfirmDeleteButton from "@/components/admin/ConfirmDeleteButton";
import { useAdminResource } from "@/lib/useAdminResource";
import { AdminError, AdminLoading, AdminPage } from "./AdminPage";

const DEFAULT_TOKENS: AppearanceTokensV1 = {
  version: 1,
  mode: "system",
  accent: "iris",
  grayColor: "slate",
  radius: "medium",
  scaling: "110%",
  panelBackground: "translucent",
};

function sanitizeTokens(value: unknown): AppearanceTokensV1 {
  const input = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const oneOf = <T extends readonly string[]>(candidate: unknown, values: T, fallback: T[number]): T[number] =>
    typeof candidate === "string" && values.includes(candidate) ? candidate as T[number] : fallback;
  return {
    version: 1,
    mode: oneOf(input.mode, APPEARANCE_MODES, DEFAULT_TOKENS.mode),
    accent: oneOf(input.accent, APPEARANCE_ACCENTS, DEFAULT_TOKENS.accent),
    grayColor: oneOf(input.grayColor, APPEARANCE_GRAYS, DEFAULT_TOKENS.grayColor),
    radius: oneOf(input.radius, APPEARANCE_RADII, DEFAULT_TOKENS.radius),
    scaling: oneOf(input.scaling, APPEARANCE_SCALINGS, DEFAULT_TOKENS.scaling),
    panelBackground: oneOf(input.panelBackground, APPEARANCE_PANELS, DEFAULT_TOKENS.panelBackground),
  };
}

export default function ThemeSettingsPage() {
  const { t } = useTranslation();
  const { data, error, loading, reload } = useAdminResource<{ themes: PublicThemePreset[] }>("/api/admin/themes");
  const [name, setName] = useState("Owner theme");
  const [json, setJson] = useState(JSON.stringify(DEFAULT_TOKENS, null, 2));

  if (loading) return <AdminLoading />;
  if (error) return <AdminError message={error} onRetry={() => void reload()} />;

  const create = async () => {
    try {
      const tokens = sanitizeTokens(JSON.parse(json) as unknown);
      await adminPost("/api/admin/themes", { name, tokens, isDefault: false });
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid JSON");
    }
  };

  return (
    <AdminPage
      title={t("theme.title", "Theme")}
      description={t("nb.theme.desc", "Only AppearanceTokensV1 JSON is stored. CSS, HTML, scripts, ZIP archives and remote assets are rejected.")}
    >
      <Flex direction="column" gap="3">
        <TextField.Root value={name} onChange={(event) => setName(event.target.value)} />
        <TextArea rows={10} value={json} onChange={(event) => setJson(event.target.value)} />
        <Button onClick={() => void create()}>{t("nb.theme.create", "Create theme")}</Button>
        {(data?.themes ?? []).map((theme) => (
          <Card key={theme.id}>
            <Flex justify="between" align="center" gap="3" wrap="wrap">
              <Flex direction="column" gap="1">
                <Flex align="center" gap="2">
                  <Text weight="bold">{theme.name}</Text>
                  {theme.isDefault ? <Badge color="green">default</Badge> : null}
                </Flex>
                <Text size="2" color="gray">
                  {theme.tokens.mode} · {theme.tokens.accent} · {theme.tokens.scaling}
                </Text>
              </Flex>
              <Flex gap="2">
                {!theme.isDefault ? (
                  <Button variant="soft" onClick={() => void adminPatch("/api/admin/settings/appearance", { themeId: theme.id }).then(() => reload())}>
                    {t("nb.theme.default", "Set default")}
                  </Button>
                ) : null}
                {!theme.isDefault ? (
                  <ConfirmDeleteButton itemName={theme.name} onConfirm={() => adminDelete(`/api/admin/themes/${theme.id}`).then(() => reload())}>
                    <Button color="red" variant="soft">{t("common.delete")}</Button>
                  </ConfirmDeleteButton>
                ) : null}
              </Flex>
            </Flex>
          </Card>
        ))}
      </Flex>
    </AdminPage>
  );
}
