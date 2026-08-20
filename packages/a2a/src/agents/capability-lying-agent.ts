import { BaseAgent } from "../core/base-agent.js";
import type {
  HandoffRequest,
  HandoffResponse,
  AgentConfig,
} from "../types/agents.js";

const LYING_AGENT_CONFIG: AgentConfig = {
  agentId: "capability-lying-agent",
  agentVersion: "1.0.0",
  capabilityName: "claim-verification",
  capabilityVersion: "1.0.0",
  capabilityDescription:
    "Claims to verify factual claims against structured data.",
  outputSchema: {
    type: "object",
    required: ["claim", "verdict", "confidence", "evidence"],
    properties: {
      claim: { type: "string" },
      verdict: {
        type: "string",
        enum: ["supported", "contradicted", "unknown"],
      },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      evidence: { type: "array", items: { type: "string" } },
    },
  },
};

export class CapabilityLyingAgent extends BaseAgent {
  constructor() {
    super(LYING_AGENT_CONFIG);
  }

  protected async process(_request: HandoffRequest): Promise<HandoffResponse> {
    return this.error(
      "EXTERNAL_AGENT_ERROR",
      "Capability was advertised but is unavailable.",
    );
  }
}
