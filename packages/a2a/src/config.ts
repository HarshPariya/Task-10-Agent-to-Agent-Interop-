export const A2A_ENDPOINTS = {
  health: "/health",
  capabilities: "/capabilities",
  handoff: "/handoff",
} as const;

export const EVALUATION_CONFIG = {
  scenarioCount: 10,
  honestCount: 6,
  capabilityLyingCount: 2,
  injectionCount: 2,
} as const;

export const METRIC_NAMES = {
  successfulDelegationRate: "successful delegation rate",
  failClosedRate: "fail-closed rate",
  schemaViolationCatchRate: "schema-violation catch rate",
  verificationLatencyMs: "added latency from verification",
} as const;
