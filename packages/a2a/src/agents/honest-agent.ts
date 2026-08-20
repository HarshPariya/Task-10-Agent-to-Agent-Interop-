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
    verdict: { type: "string", enum: ["supported", "contradicted", "unknown"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: { type: "array", items: { type: "string" } },
  },
});

interface ClaimRecord {
  verdict: "supported" | "contradicted";
  evidence: string;
}

const DATASET: Record<string, ClaimRecord> = {
  "the earth orbits the sun": {
    verdict: "supported",
    evidence: "The dataset records Earth as an orbiting body of the Sun.",
  },
  "water freezes at 0 degrees celsius at standard pressure": {
    verdict: "supported",
    evidence:
      "The dataset records 0°C as water's freezing point at standard pressure.",
  },
  "the sun orbits the earth": {
    verdict: "contradicted",
    evidence: "The dataset records Earth as orbiting the Sun.",
  },
};

export class HonestAgent implements ExternalAgent {
  private readonly metadata = {
    agentId: "honest-claim-verifier",
    agentVersion: "1.0.0",
  };

  private readonly capabilities = [
    {
      name: CAPABILITY_NAME,
      version: CAPABILITY_VERSION,
      description: "Verifies factual claims against a structured dataset.",
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
    request: HandoffRequest,
    _capability: (typeof this.capabilities)[0],
  ): Promise<HandoffResponse> {
    const claim = request.task.trim().toLowerCase();
    const record = DATASET[claim];

    const result = record
      ? {
          claim: request.task.trim(),
          verdict: record.verdict,
          confidence: 1,
          evidence: [record.evidence],
        }
      : {
          claim: request.task.trim(),
          verdict: "unknown" as const,
          confidence: 0,
          evidence: ["The claim was not found in the external dataset."],
        };

    return this.success(request, result);
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

  private success(request: HandoffRequest, result: unknown): HandoffResponse {
    return {
      protocolVersion: PROTOCOL_VERSION,
      requestId: request.requestId,
      status: "success",
      result,
    };
  }
}
