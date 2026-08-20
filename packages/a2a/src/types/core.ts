export const PROTOCOL_VERSION = "a2a/v1" as const;

export type A2AErrorCode =
  | "CAPABILITY_DISCOVERY_FAILED"
  | "CAPABILITY_NOT_SUPPORTED"
  | "INVALID_CAPABILITY_MANIFEST"
  | "INVALID_REQUEST"
  | "INVALID_RESPONSE"
  | "SCHEMA_VALIDATION_FAILED"
  | "INJECTION_DETECTED"
  | "REQUEST_TIMEOUT"
  | "EXTERNAL_AGENT_ERROR";

export interface Capability {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly inputSchema: string;
  readonly outputSchema: string;
}

export interface CapabilityManifest {
  readonly protocolVersion: string;
  readonly agentId: string;
  readonly agentVersion: string;
  readonly capabilities: readonly Capability[];
}

export type HandoffStatus = "success" | "rejected" | "error";

export interface HandoffError {
  readonly code: string;
  readonly message: string;
}

export interface HandoffRequest {
  readonly protocolVersion: string;
  readonly requestId: string;
  readonly capability: string;
  readonly capabilityVersion: string;
  readonly task: string;
  readonly timeoutMs: number;
}

export interface HandoffResponse<T = unknown> {
  readonly protocolVersion: string;
  readonly requestId: string;
  readonly status: HandoffStatus;
  readonly result?: T;
  readonly error?: HandoffError;
}

export interface AgentConfig {
  readonly agentId: string;
  readonly agentVersion: string;
  readonly capabilityName: string;
  readonly capabilityVersion: string;
  readonly capabilityDescription: string;
  readonly outputSchema: JsonSchema;
}

export interface JsonSchema {
  readonly type: string;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly items?: JsonSchema;
  readonly enum?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
}

export const OUTPUT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["claim", "verdict", "confidence", "evidence"],
  properties: {
    claim: { type: "string" },
    verdict: { type: "string", enum: ["supported", "contradicted", "unknown"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: { type: "array", items: { type: "string" } },
  },
} as const;
