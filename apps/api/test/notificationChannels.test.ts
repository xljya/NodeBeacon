import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, loginOwner } from "./helpers.js";

describe("notification channel validation", () => {
  let app: FastifyInstance;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    app = await buildTestApp();
    cookies = await loginOwner(app);
  });

  afterAll(() => app.close());

  it("rejects incomplete Telegram and SMTP configurations", async () => {
    const telegram = await app.inject({
      method: "POST",
      url: "/api/admin/notification-channels",
      cookies,
      payload: {
        name: "Telegram",
        type: "telegram",
        config: { botToken: "token", chatId: "" }
      }
    });
    expect(telegram.statusCode).toBe(400);
    expect(telegram.json().error.code).toBe("invalid_channel");

    const smtp = await app.inject({
      method: "POST",
      url: "/api/admin/notification-channels",
      cookies,
      payload: {
        name: "SMTP",
        type: "smtp",
        config: { host: "smtp.example.com" }
      }
    });
    expect(smtp.statusCode).toBe(400);
    expect(smtp.json().error.code).toBe("invalid_channel");
  });

  it("accepts complete Telegram and SMTP configurations and masks secrets", async () => {
    const telegram = await app.inject({
      method: "POST",
      url: "/api/admin/notification-channels",
      cookies,
      payload: {
        name: "Telegram",
        type: "telegram",
        config: { botToken: "token", chatId: "12345" }
      }
    });
    expect(telegram.statusCode).toBe(200);
    expect(telegram.json().config).toMatchObject({ botToken: "••••••", chatId: "12345" });

    const smtp = await app.inject({
      method: "POST",
      url: "/api/admin/notification-channels",
      cookies,
      payload: {
        name: "SMTP",
        type: "smtp",
        config: {
          host: "smtp.example.com",
          port: 465,
          username: "owner@example.com",
          password: "secret",
          from: "owner@example.com",
          to: "alerts@example.com"
        }
      }
    });
    expect(smtp.statusCode).toBe(200);
    expect(smtp.json().config).toMatchObject({
      host: "smtp.example.com",
      password: "••••••",
      to: "alerts@example.com"
    });
  });
});
