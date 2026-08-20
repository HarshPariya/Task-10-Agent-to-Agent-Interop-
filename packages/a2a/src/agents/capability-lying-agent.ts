import type { CapabilityManifest } from "../protocol/capability.js";
import type { HandoffRequest, HandoffResponse } from "../protocol/handoff.js";
import type { ExternalAgent } from "../server/external-agent-server.js";
import { A2AError } from "../protocol/errors.js";

const PROTOCOL_VERSION = "a2a/v1" as const;
const CAPABILITY_NAME = "claim-verification";
const CAPABILITY_VERSION = "1.0.0";
const MAX_TASK_LENGTH = 10_000;

const OUTPUT_SCHEMA = JSON.stringify({
  type: "object",
  required: ["claim", "verdict", "confidence", "evidence"],
  properties: {
    claim: { type: "string" },
    verdict: { type: "string" },
    confidence: { type: "number" },
    evidence: { type: "array" },
  },
});

export class CapabilityLyingAgent implements ExternalAgent {
  private readonly metadata = {
    agentId: "capability-lying-agent",
    agentVersion: "1.0.0",
  };

  private readonly capabilities = [
    {
      name: CAPABILITY_NAME,
      version: CAPABILITY_VERSION,
      description: "Claims to verify factual claims against structured data.",
      inputSchema: JSON.stringify({
        type: "object",
        required: ["task"],
        properties: { task: { type: "string", minLength: 1 } },
      }),
      outputSchema: OUTPUT_SCHEMA,
    },
  ];

  getCapabilities(): CapabilityManifest {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentId: this.metadata.agentId,
      agentVersion: this.metadata.agentVersion,
      capabilities: this.capabilities.map((c) => ({ ...c })),
    };
  }

  async handleHandoff(request: HandoffRequest): Promise<HandoffResponse> {
    this.validateRequest(request);

    const capability = this.capabilities.find(
      (c) =>
        c.name === request.capability &&
        c.version === request.capabilityVersion,
    );

    if (!capability) {
      return this.reject(
        request,
        "CAPABILITY_NOT_SUPPORTED",
        "Requested capability is not supported.",
      );
    }

    return this.process(request, capability);
  }

  private async process(
    _request: HandoffRequest,
    _capability: (typeof this.capabilities)[0],
  ): Promise<HandoffResponse> {
    return this.error(
      "EXTERNAL_AGENT_ERROR",
      "Capability was advertised but is unavailable.",
    );
  }

  private validateRequest(request: HandoffRequest): void {
    const task = request.task?.trim();
    if (!task || task.length > MAX_TASK_LENGTH) {
      throw new A2AError("INVALID_REQUEST", "Task is empty or too long.");
    }
  }

  private reject(
    request: HandoffRequest,
    code: string,
    message: string,
  ): HandoffResponse {
    return {
      protocolVersion: PROTOCOL_VERSION,
      requestId: request.requestId,
      status: "rejected",
      error: { code, message },
    };
  }

  private error(code: string, message: string): HandoffResponse {
    return {
      protocolVersion: PROTOCOL_VERSION,
      requestId: "unknown",
      status: "error",
      error: { code, message },
    };
  }
}
