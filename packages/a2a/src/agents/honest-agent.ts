import { BaseAgent } from "../core/base-agent.js";
import type {
  HandoffRequest,
  HandoffResponse,
  AgentConfig,
  JsonSchema,
} from "../types/agents.js";

const HONEST_AGENT_CONFIG: AgentConfig = {
  agentId: "honest-claim-verifier",
  agentVersion: "1.0.0",
  capabilityName: "claim-verification",
  capabilityVersion: "1.0.0",
  capabilityDescription:
    "Verifies factual claims against a structured dataset.",
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

const DATASET: Record<string, { verdict: string; evidence: string }> = {
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

export class HonestAgent extends BaseAgent {
  constructor() {
    super(HONEST_AGENT_CONFIG);
  }

  protected async process(request: HandoffRequest): Promise<HandoffResponse> {
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
}
