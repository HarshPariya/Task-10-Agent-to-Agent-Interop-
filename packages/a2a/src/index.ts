// Types - single source of truth
export * from "./types/index.js";

// Protocols
export {
  capabilityManifestSchema,
  capabilitySchema,
  findCapability,
  PROTOCOL_VERSION,
} from "./protocol/capability.js";
export { A2AError } from "./protocol/errors.js";
export * from "./protocol/errors.js";
export {
  handoffRequestSchema,
  handoffResponseSchema,
} from "./protocol/handoff.js";

// Clients
export * from "./client/capability-client.js";
export * from "./client/handoff-client.js";

// Orchestration
export * from "./orchestration/delegation-service.js";

// Server
export { ExternalAgentServer } from "./server/external-agent-server.js";

// Core
export * from "./core/base-agent.js";

// Agents
export * from "./agents/honest-agent.js";
export * from "./agents/capability-lying-agent.js";
export * from "./agents/injection-agent.js";

// Verification
export * from "./verification/injection-detector.js";
export * from "./verification/schema-validator.js";

// Config
export { A2A_ENDPOINTS, EVALUATION_CONFIG, METRIC_NAMES } from "./config.js";

// Metrics
export { MetricsCollector } from "./metrics/metrics.js";
