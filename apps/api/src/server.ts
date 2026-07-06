import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { loadEnv } from "./config/env.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerStatusRoutes } from "./routes/status.js";

const webDistPath = fileURLToPath(new URL("../../web/dist/", import.meta.url));

export async function createApp() {
  const env = loadEnv();
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  await app.register(cors, {
    origin: env.webOrigin,
    credentials: true
  });

  await registerHealthRoutes(app);
  await registerStatusRoutes(app, env);

  if (existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: "/"
    });

    app.setNotFoundHandler((request, reply) => {
      const url = request.raw.url ?? "";
      if (url.startsWith("/api/")) {
        return reply.code(404).send({ error: { code: "not_found", message: "API route not found." } });
      }
      return reply.sendFile("index.html");
    });
  }

  return { app, env };
}

async function start(): Promise<void> {
  const { app, env } = await createApp();
  try {
    await app.listen({ host: env.host, port: env.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) {
  void start();
}
