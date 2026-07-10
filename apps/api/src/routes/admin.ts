import type { FastifyInstance } from "fastify";
import type {
  AdminNodeMutation,
  AdminNodeOrderRequest,
  AdminNodeResponse,
  AdminNode,
  AdminNodesResponse,
  AdminAuditEventsResponse,
  AdminSessionsResponse,
  AdminSummaryResponse,
  AdminUsersResponse,
  NodeBilling,
  NodeConfigEntry,
  StatusNode
} from "@nodebeacon/shared";
import { buildApiError } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import { loadNodeRegistry, saveNodeRegistry, withRegistryLock } from "../config/nodeRegistry.js";
import type { AuthService } from "../services/authService.js";
import type { AuditService } from "../services/auditService.js";
import type { SessionService } from "../services/sessionService.js";
import { clearStatusCache, getPrometheusReachability, getStatus } from "../services/statusService.js";

const NODE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

class AdminValidationError extends Error {
  constructor(message: string, readonly statusCode = 400, readonly code = "invalid_node") {
    super(message);
    this.name = "AdminValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function requiredString(value: unknown, field: string): string {
  const text = optionalString(value);
  if (!text) throw new AdminValidationError(`${field} is required.`);
  return text;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new AdminValidationError("displayOrder and billing numbers must be finite.");
  return parsed;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  return Boolean(value);
}

function normalizeLabels(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new AdminValidationError("labels must be an object.");
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, labelValue]) => [key.trim(), String(labelValue).trim()])
      .filter(([key, labelValue]) => key && labelValue)
  );
}

function normalizeTags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return [...new Set(value.map(String).map((tag) => tag.trim()).filter(Boolean))];
  }
  if (typeof value === "string") {
    return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))];
  }
  throw new AdminValidationError("tags must be an array or comma-separated string.");
}

function normalizeBilling(value: unknown): NodeBilling | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new AdminValidationError("billing must be an object.");
  const billing: NodeBilling = {};
  const price = optionalNumber(value.price);
  const cycleDays = optionalNumber(value.cycleDays);
  const currency = optionalString(value.currency);
  const expiresAt = optionalString(value.expiresAt);
  const autoRenewal = optionalBoolean(value.autoRenewal);

  if (price !== undefined) billing.price = price;
  if (currency) billing.currency = currency;
  if (cycleDays !== undefined) billing.cycleDays = cycleDays;
  if (expiresAt) billing.expiresAt = expiresAt;
  if (autoRenewal !== undefined) billing.autoRenewal = autoRenewal;

  return Object.keys(billing).length > 0 ? billing : undefined;
}

function cleanMutation(raw: unknown): AdminNodeMutation {
  if (!isRecord(raw)) throw new AdminValidationError("Request body must be an object.");
  const input: AdminNodeMutation = {};
  if ("id" in raw) input.id = optionalString(raw.id);
  if ("name" in raw) input.name = optionalString(raw.name);
  if ("provider" in raw) input.provider = optionalString(raw.provider);
  if ("group" in raw) input.group = optionalString(raw.group);
  if ("region" in raw) input.region = optionalString(raw.region);
  if ("location" in raw) input.location = optionalString(raw.location);
  if ("displayOrder" in raw) input.displayOrder = optionalNumber(raw.displayOrder);
  if ("public" in raw) input.public = optionalBoolean(raw.public);
  if ("labels" in raw) input.labels = normalizeLabels(raw.labels);
  if ("tags" in raw) input.tags = normalizeTags(raw.tags);
  if ("ipAddress" in raw) input.ipAddress = optionalString(raw.ipAddress);
  if ("clientVersion" in raw) input.clientVersion = optionalString(raw.clientVersion);
  if ("privateNotes" in raw) input.privateNotes = optionalString(raw.privateNotes);
  if ("billing" in raw) input.billing = normalizeBilling(raw.billing);
  return input;
}

function assertNodeId(id: string): void {
  if (!NODE_ID_PATTERN.test(id)) {
    throw new AdminValidationError("id must be 1-64 characters and contain only letters, numbers, dot, underscore or dash.");
  }
}

function nextDisplayOrder(nodes: NodeConfigEntry[]): number {
  const max = nodes.reduce((current, node) => Math.max(current, node.displayOrder), 0);
  return Math.ceil(max / 10) * 10 + 10;
}

function createNodeEntry(input: AdminNodeMutation, nodes: NodeConfigEntry[]): NodeConfigEntry {
  const id = requiredString(input.id, "id");
  assertNodeId(id);
  if (nodes.some((node) => node.id === id)) {
    throw new AdminValidationError("A node with this id already exists.", 409, "node_exists");
  }

  return {
    id,
    name: requiredString(input.name ?? id, "name"),
    provider: input.provider ?? "unknown",
    group: input.group ?? "default",
    region: input.region ?? "unknown",
    location: input.location,
    displayOrder: input.displayOrder ?? nextDisplayOrder(nodes),
    public: input.public ?? true,
    labels: input.labels ?? {},
    tags: input.tags ?? [],
    ipAddress: input.ipAddress,
    clientVersion: input.clientVersion,
    privateNotes: input.privateNotes,
    billing: input.billing
  };
}

function patchNodeEntry(existing: NodeConfigEntry, input: AdminNodeMutation): NodeConfigEntry {
  return {
    ...existing,
    name: input.name ?? existing.name,
    provider: input.provider ?? existing.provider,
    group: input.group ?? existing.group,
    region: input.region ?? existing.region,
    location: "location" in input ? input.location : existing.location,
    displayOrder: input.displayOrder ?? existing.displayOrder,
    public: input.public ?? existing.public,
    labels: input.labels ?? existing.labels,
    tags: input.tags ?? existing.tags,
    ipAddress: "ipAddress" in input ? input.ipAddress : existing.ipAddress,
    clientVersion: "clientVersion" in input ? input.clientVersion : existing.clientVersion,
    privateNotes: "privateNotes" in input ? input.privateNotes : existing.privateNotes,
    billing: "billing" in input ? input.billing : existing.billing
  };
}

function toAdminNode(node: StatusNode, registry?: NodeConfigEntry): AdminNode {
  return {
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
    ipAddress: registry?.ipAddress,
    clientVersion: registry?.clientVersion,
    privateNotes: registry?.privateNotes,
    billing: registry?.billing,
    online: node.online,
    status: node.status,
    updatedAt: node.updatedAt
  };
}

async function getAdminNodes(env: ApiEnv, logger: Parameters<typeof getStatus>[1]): Promise<AdminNode[]> {
  const [status, registry] = await Promise.all([
    getStatus(env, logger),
    loadNodeRegistry(env.nodeConfigPath, env.nodeConfigSeedPath, logger)
  ]);
  const registryById = new Map(registry.map((node) => [node.id, node]));
  return status.nodes.map((node) => toAdminNode(node, registryById.get(node.id)));
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  env: ApiEnv,
  authService: AuthService,
  sessionService: SessionService,
  auditService: AuditService
): Promise<void> {
  // All admin endpoints are owner-only. Mutating routes only write the node
  // registry metadata; they never proxy shell/agent execution.
  const ownerOnly = { preHandler: app.requireOwner };

  app.get("/api/admin/summary", ownerOnly, async (request): Promise<AdminSummaryResponse> => {
    const status = await getStatus(env, request.log);
    return {
      generatedAt: new Date().toISOString(),
      version: env.appVersion,
      prometheus: {
        configured: Boolean(env.prometheusUrl),
        host: env.prometheusUrl ? safeHost(env.prometheusUrl) : undefined,
        // Based on the latest real upstream attempt, not inferred from whether
        // a cached response happens to be marked stale.
        reachable: getPrometheusReachability(env)
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
    return { nodes: await getAdminNodes(env, request.log) };
  });

  app.post<{ Body: AdminNodeMutation }>(
    "/api/admin/nodes",
    ownerOnly,
    async (request, reply): Promise<AdminNodeResponse | void> => {
      try {
        const input = cleanMutation(request.body);
        const entry = await withRegistryLock(async () => {
          const nodes = await loadNodeRegistry(env.nodeConfigPath, env.nodeConfigSeedPath, request.log);
          const created = createNodeEntry(input, nodes);
          await saveNodeRegistry([...nodes, created], env.nodeConfigPath);
          return created;
        });
        clearStatusCache();
        auditService.record({
          actor: request.user!.id,
          action: "node.created",
          entityId: entry.id,
          payload: entry
        });
        const adminNodes = await getAdminNodes(env, request.log);
        const node = adminNodes.find((candidate) => candidate.id === entry.id);
        if (!node) return reply.code(500).send(buildApiError("node_save_failed", "Node was saved but could not be reloaded."));
        return { node };
      } catch (error) {
        if (error instanceof AdminValidationError) {
          return reply.code(error.statusCode).send(buildApiError(error.code, error.message));
        }
        request.log.error({ error }, "failed to create admin node");
        return reply.code(503).send(buildApiError("node_registry_unwritable", "Node registry is not writable."));
      }
    }
  );

  // Batch reorder: one request instead of N concurrent PATCHes, so the whole
  // permutation is applied under a single registry lock (no lost updates).
  // Static route wins over ":id", so "order" is reserved as a node id.
  app.patch<{ Body: AdminNodeOrderRequest }>(
    "/api/admin/nodes/order",
    ownerOnly,
    async (request, reply): Promise<AdminNodesResponse | void> => {
      try {
        const body: unknown = request.body;
        if (!isRecord(body) || !Array.isArray(body.ids)) {
          throw new AdminValidationError("ids must be an array of node ids.", 400, "invalid_order");
        }
        const ids = body.ids.map(String);

        await withRegistryLock(async () => {
          const nodes = await loadNodeRegistry(env.nodeConfigPath, env.nodeConfigSeedPath, request.log);
          const byId = new Map(nodes.map((node) => [node.id, node]));
          const isPermutation =
            ids.length === nodes.length &&
            new Set(ids).size === ids.length &&
            ids.every((id) => byId.has(id));
          if (!isPermutation) {
            throw new AdminValidationError("ids must list every node id exactly once.", 400, "invalid_order");
          }
          const reordered = ids.map((id, index) => ({
            ...(byId.get(id) as NodeConfigEntry),
            displayOrder: (index + 1) * 10
          }));
          await saveNodeRegistry(reordered, env.nodeConfigPath);
        });
        clearStatusCache();
        auditService.record({
          actor: request.user!.id,
          action: "node.reordered",
          payload: { ids }
        });
        return { nodes: await getAdminNodes(env, request.log) };
      } catch (error) {
        if (error instanceof AdminValidationError) {
          return reply.code(error.statusCode).send(buildApiError(error.code, error.message));
        }
        request.log.error({ error }, "failed to reorder admin nodes");
        return reply.code(503).send(buildApiError("node_registry_unwritable", "Node registry is not writable."));
      }
    }
  );

  app.patch<{ Params: { id: string }; Body: AdminNodeMutation }>(
    "/api/admin/nodes/:id",
    ownerOnly,
    async (request, reply): Promise<AdminNodeResponse | void> => {
      try {
        const input = cleanMutation(request.body);
        const updated = await withRegistryLock(async () => {
          const nodes = await loadNodeRegistry(env.nodeConfigPath, env.nodeConfigSeedPath, request.log);
          const index = nodes.findIndex((node) => node.id === request.params.id);
          const existing = index === -1 ? undefined : nodes[index];
          if (!existing) {
            throw new AdminValidationError("Unknown node id.", 404, "node_not_found");
          }
          const updatedNodes = [...nodes];
          const updated = patchNodeEntry(existing, input);
          updatedNodes[index] = updated;
          await saveNodeRegistry(updatedNodes, env.nodeConfigPath);
          return updated;
        });
        clearStatusCache();
        auditService.record({
          actor: request.user!.id,
          action: "node.updated",
          entityId: request.params.id,
          payload: { changes: input, node: updated }
        });
        const node = (await getAdminNodes(env, request.log)).find((candidate) => candidate.id === request.params.id);
        if (!node) return reply.code(500).send(buildApiError("node_save_failed", "Node was saved but could not be reloaded."));
        return { node };
      } catch (error) {
        if (error instanceof AdminValidationError) {
          return reply.code(error.statusCode).send(buildApiError(error.code, error.message));
        }
        request.log.error({ error, nodeId: request.params.id }, "failed to update admin node");
        return reply.code(503).send(buildApiError("node_registry_unwritable", "Node registry is not writable."));
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/admin/nodes/:id",
    ownerOnly,
    async (request, reply): Promise<{ ok: true } | void> => {
      try {
        const deleted = await withRegistryLock(async () => {
          const nodes = await loadNodeRegistry(env.nodeConfigPath, env.nodeConfigSeedPath, request.log);
          const deleted = nodes.find((node) => node.id === request.params.id);
          const updatedNodes = nodes.filter((node) => node.id !== request.params.id);
          if (!deleted) {
            throw new AdminValidationError("Unknown node id.", 404, "node_not_found");
          }
          await saveNodeRegistry(updatedNodes, env.nodeConfigPath);
          return deleted;
        });
        clearStatusCache();
        auditService.record({
          actor: request.user!.id,
          action: "node.deleted",
          entityId: request.params.id,
          payload: deleted
        });
        return { ok: true };
      } catch (error) {
        if (error instanceof AdminValidationError) {
          return reply.code(error.statusCode).send(buildApiError(error.code, error.message));
        }
        request.log.error({ error, nodeId: request.params.id }, "failed to delete admin node");
        return reply.code(503).send(buildApiError("node_registry_unwritable", "Node registry is not writable."));
      }
    }
  );

  app.get("/api/admin/users", ownerOnly, async (): Promise<AdminUsersResponse> => {
    return { users: authService.getUsers() };
  });

  app.get("/api/admin/sessions", ownerOnly, async (request): Promise<AdminSessionsResponse> => ({
    sessions: sessionService.listActive(request.user!.id, request.sessionId)
  }));

  app.delete<{ Params: { id: string } }>(
    "/api/admin/sessions/:id",
    ownerOnly,
    async (request, reply): Promise<{ ok: true } | void> => {
      if (!sessionService.revoke(request.params.id, request.user!.id)) {
        return reply.code(404).send(buildApiError("session_not_found", "Active session not found."));
      }
      auditService.record({
        actor: request.user!.id,
        action: "session.revoked",
        entityId: request.params.id
      });
      if (request.sessionId === request.params.id) app.clearSession(reply);
      return { ok: true };
    }
  );

  app.get<{ Querystring: { limit?: string } }>(
    "/api/admin/audit-events",
    ownerOnly,
    async (request): Promise<AdminAuditEventsResponse> => {
      const parsed = Number.parseInt(request.query.limit ?? "100", 10);
      return { events: auditService.list(Number.isFinite(parsed) ? parsed : 100) };
    }
  );
}
