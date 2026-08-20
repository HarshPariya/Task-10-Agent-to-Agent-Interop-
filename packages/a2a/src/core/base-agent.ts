import { PROTOCOL_VERSION } from "../protocol/capability.js";
import { A2AError } from "../protocol/errors.js";
import type {
  AgentConfig,
  HandoffRequest,
  HandoffResponse,
} from "../types/index.js";

export abstract class BaseAgent {
  protected readonly config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  getCapabilities() {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentId: this.config.agentId,
      agentVersion: this.config.agentVersion,
      capabilities: [
        {
          name: this.config.capabilityName,
          version: this.config.capabilityVersion,
          description: this.config.capabilityDescription,
          inputSchema: JSON.stringify({
            type: "object",
            properties: { task: { type: "string" } },
          }),
          outputSchema: JSON.stringify(this.config.outputSchema),
        },
      ],
    };
  }

  protected success<T>(_request: HandoffRequest, data: T): HandoffResponse {
    return {
      protocolVersion: PROTOCOL_VERSION,
      requestId: crypto.randomUUID(),
      status: "success",
      result: data,
    };
  }

  protected error(code: string, message: string): HandoffResponse {
    return {
      protocolVersion: PROTOCOL_VERSION,
      requestId: crypto.randomUUID(),
      status: "error",
      error: { code, message },
    };
  }

  protected reject(code: string, message: string): HandoffResponse {
    return {
      protocolVersion: PROTOCOL_VERSION,
      requestId: crypto.randomUUID(),
      status: "rejected",
      error: { code, message },
    };
  }

  protected abstract process(request: HandoffRequest): Promise<HandoffResponse>;

  async handleHandoff(request: HandoffRequest): Promise<HandoffResponse> {
    try {
      return await this.process(request);
    } catch (err) {
      return err instanceof A2AError
        ? this.error(err.code, err.message)
        : this.error("EXTERNAL_AGENT_ERROR", "Unexpected agent error.");
    }
  }
}
