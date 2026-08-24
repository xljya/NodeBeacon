import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAlertRuleMutation,
  buildNotificationChannelConfig,
  buildTrafficReportMutation,
} from "./adminForms.ts";

describe("Admin form payloads", () => {
  it("builds complete Telegram and SMTP channel configs", () => {
    assert.deepEqual(
      buildNotificationChannelConfig("telegram", {
        botToken: "token",
        chatId: "12345",
      }),
      { botToken: "token", chatId: "12345" },
    );
    assert.deepEqual(
      buildNotificationChannelConfig("smtp", {
        host: "smtp.example.com",
        port: "465",
        username: "owner@example.com",
        password: "secret",
        from: "owner@example.com",
        to: "alerts@example.com",
      }),
      {
        host: "smtp.example.com",
        port: 465,
        username: "owner@example.com",
        password: "secret",
        from: "owner@example.com",
        to: "alerts@example.com",
      },
    );
    assert.throws(
      () => buildNotificationChannelConfig("telegram", { botToken: "token" }),
      /chat id/i,
    );
  });

  it("keeps rule target, channels and typed configuration", () => {
    assert.deepEqual(
      buildAlertRuleMutation({
        name: "High load",
        type: "load",
        nodeId: "rs1000",
        channelIds: ["channel-1"],
        configText: '{"threshold":2,"durationSeconds":300}',
        enabled: true,
      }),
      {
        name: "High load",
        type: "load",
        nodeId: "rs1000",
        channelIds: ["channel-1"],
        config: { threshold: 2, durationSeconds: 300 },
        enabled: true,
      },
    );
    assert.throws(
      () => buildAlertRuleMutation({
        name: "Broken",
        type: "offline",
        nodeId: "",
        channelIds: [],
        configText: "[]",
        enabled: true,
      }),
      /JSON object/i,
    );
  });

  it("keeps traffic report period, nodes and channels", () => {
    assert.deepEqual(
      buildTrafficReportMutation({
        name: "Daily traffic",
        period: "daily",
        time: "09:00",
        timezone: "Asia/Shanghai",
        nodeIds: ["rs1000", "rs1000"],
        channelIds: ["channel-1"],
        enabled: true,
      }),
      {
        name: "Daily traffic",
        period: "daily",
        time: "09:00",
        timezone: "Asia/Shanghai",
        nodeIds: ["rs1000"],
        channelIds: ["channel-1"],
        enabled: true,
      },
    );
    assert.throws(
      () => buildTrafficReportMutation({
        name: "Broken",
        period: "daily",
        time: "9:00",
        timezone: "Asia/Shanghai",
        nodeIds: [],
        channelIds: [],
        enabled: true,
      }),
      /HH:MM/,
    );
  });
});
