import fastify from "fastify";

/**
 * Deliberately small executor placeholder. It exposes no shell endpoint and
 * stays disabled (replicas: 0) until the allow-listed SSH worker rollout.
 */
const app = fastify({ logger: true });
app.get("/healthz", async () => ({ status: "ok", enabled: false }));
app.post("/run", async (_request, reply) => reply.code(503).send({ error: { code: "executor_disabled", message: "Executor rollout is disabled." } }));
await app.listen({ host: process.env.EXECUTOR_HOST ?? "0.0.0.0", port: Number(process.env.EXECUTOR_PORT ?? 8080) });
