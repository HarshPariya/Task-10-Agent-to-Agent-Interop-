import { CapabilityClient } from "../client/capability-client.js";
import { HandoffClient } from "../client/handoff-client.js";
import { A2AError } from "../protocol/errors.js";
import { ResponseVerifier } from "../verification/response-verifier.js";

export interface DelegationOptions {
  agentUrl: string;
  capability: string;
  capabilityVersion: string;
  task: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface DelegationResult<T> {
  accepted: boolean;
  data?: T;
  reason?: string;
}

export class DelegationService {
  private readonly verifier: ResponseVerifier;

  constructor(verifier = new ResponseVerifier()) {
    this.verifier = verifier;
  }

  async delegate<T>(options: DelegationOptions): Promise<DelegationResult<T>> {
    const clientOptions = {
      baseUrl: options.agentUrl,
      timeoutMs: options.timeoutMs ?? 3000,
      maxRetries: options.maxRetries ?? 2,
    };

    const capabilityClient = new CapabilityClient(clientOptions);
    const handoffClient = new HandoffClient(clientOptions);

    const capability = await capabilityClient.requireCapability(
      options.capability,
      options.capabilityVersion,
    );

    if (!capability.outputSchema) {
      throw new A2AError(
        "INVALID_CAPABILITY_MANIFEST",
        `Capability "${options.capability}@${options.capabilityVersion}" has no output schema.`,
      );
    }

    const response = await handoffClient.handoff({
      capability: options.capability,
      capabilityVersion: options.capabilityVersion,
      task: options.task,
    });

    const verification = this.verifier.verify<T>(
      response.result,
      capability.outputSchema,
    );

    if (!verification.accepted) {
      return {
        accepted: false,
        reason: verification.reason ?? "Verification failed.",
      };
    }

    if (verification.data === undefined) {
      return { accepted: false, reason: "Verified response contains no data." };
    }

    return { accepted: true, data: verification.data };
  }
}
