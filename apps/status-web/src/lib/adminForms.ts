import type { AlertRule, NotificationChannel } from "./contracts.ts";

export type NotificationChannelType = NotificationChannel["type"];
export type NotificationChannelFields = Record<string, string>;

function required(fields: NotificationChannelFields, key: string, label: string): string {
  const value = fields[key]?.trim() ?? "";
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

export function buildNotificationChannelConfig(
  type: NotificationChannelType,
  fields: NotificationChannelFields,
): Record<string, unknown> {
  if (type === "webhook") {
    return { url: required(fields, "url", "Webhook URL") };
  }
  if (type === "telegram") {
    return {
      botToken: required(fields, "botToken", "Telegram bot token"),
      chatId: required(fields, "chatId", "Telegram chat ID"),
    };
  }

  const rawPort = fields.port?.trim() || "465";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP port must be between 1 and 65535.");
  }
  return {
    host: required(fields, "host", "SMTP host"),
    port,
    username: fields.username?.trim() ?? "",
    password: fields.password ?? "",
    from: required(fields, "from", "SMTP sender"),
    to: required(fields, "to", "SMTP receiver"),
  };
}

export interface AlertRuleDraft {
  name: string;
  type: AlertRule["type"];
  nodeId: string;
  channelIds: string[];
  configText: string;
  enabled: boolean;
}

export function buildAlertRuleMutation(draft: AlertRuleDraft) {
  const name = draft.name.trim();
  if (!name) throw new Error("Rule name is required.");
  const parsed = JSON.parse(draft.configText || "{}") as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Rule configuration must be a JSON object.");
  }
  return {
    name,
    type: draft.type,
    nodeId: draft.nodeId.trim() || undefined,
    channelIds: [...new Set(draft.channelIds)],
    config: parsed as Record<string, unknown>,
    enabled: draft.enabled,
  };
}
