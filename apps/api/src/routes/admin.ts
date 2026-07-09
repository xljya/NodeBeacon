import type { FastifyInstance } from "fastify";
import type {
  AdminNode,
  AdminNodesResponse,
  AdminSummaryResponse,
  AdminUsersResponse
} from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import type { AuthService } from "../services/authService.js";
import { getStatus } from "../services/statusService.js";

const APP_VERSION = process.env.APP_VERSION ?? "0.4.2";

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  env: ApiEnv,
  authService: AuthService
): Promise<void> {
  // All admin endpoints are owner-only and read-only in this iteration.
  const ownerOnly = { preHandler: app.requireOwner };

  app.get("/api/admin/summary", ownerOnly, async (request): Promise<AdminSummaryResponse> => {
    const status = await getStatus(env, request.log);
    return {
      generatedAt: new Date().toISOString(),
      version: APP_VERSION,
      prometheus: {
        configured: Boolean(env.prometheusUrl),
        host: env.prometheusUrl ? safeHost(env.prometheusUrl) : undefined,
        // If configured and the data isn't a stale fallback, treat it as reachable.
        reachable: Boolean(env.prometheusUrl) && !status.cache.stale
      },
      cache: status.cache,
      nodes: {
        total: status.summary.total,
        online: status.summary.online,
        degraded: status.summary.degraded,
        offline: status.summary.offline
      },
      auth: {
        allowRegister: env.allowRegister,
        ownerConfigured: authService.ownerConfigured
      }
    };
  });

  app.get("/api/admin/nodes", ownerOnly, async (request): Promise<AdminNodesResponse> => {
    const status = await getStatus(env, request.log);
    const nodes: AdminNode[] = status.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      provider: node.provider,
      group: node.group,
      region: node.region,
      location: node.location,
      displayOrder: node.displayOrder,
      public: node.public,
      labels: node.labels,
      tags: node.tags,
      online: node.online,
      status: node.status,
      updatedAt: node.updatedAt
    }));
    return { nodes };
  });

  app.get("/api/admin/users", ownerOnly, async (): Promise<AdminUsersResponse> => {
    return { users: authService.getUsers() };
  });
}
