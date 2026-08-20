import { CapabilityClient } from "../client/capability-client.js";
import { HandoffClient } from "../client/handoff-client.js";
import { ResponseVerifier } from "../verification/response-verifier.js";
import { A2AError } from "../protocol/errors.js";
import type {
  Capability,
  HandoffResponse,
  DelegationOptions,
  DelegationResult,
  DelegationServiceDependencies,
  VerificationResult,
} from "../types/client.js";

const DEFAULT_DEPENDENCIES: DelegationServiceDependencies = {
  verifier: new ResponseVerifier(),
  capabilityClientCtor: CapabilityClient,
  handoffClientCtor: HandoffClient,
};

const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_RETRIES = 2;

const STATUS_HANDLERS: Record<
  HandoffResponse["status"],
  (r: HandoffResponse) => DelegationResult<never>
> = {
  success: () => ({ accepted: true as const, data: undefined as never }),
  rejected: (r) => ({
    accepted: false as const,
    reason: r.error?.message ?? "Agent rejected the handoff request.",
  }),
  error: (r) => ({
    accepted: false as const,
    reason: r.error?.message ?? "Agent returned an error response.",
  }),
};

const ensureOutputSchema = (
  capability: Capability,
  name: string,
  version: string,
): void =>
  capability.outputSchema
    ? undefined
    : (() => {
        throw new A2AError(
          "INVALID_CAPABILITY_MANIFEST",
          `Capability "${name}@${version}" has no output schema.`,
        );
      })();

const resolveVerification = <T>(
  verification: VerificationResult<T>,
): DelegationResult<T> =>
  !verification.accepted
    ? { accepted: false, reason: verification.reason ?? "Verification failed." }
    : verification.data !== undefined
      ? { accepted: true, data: verification.data }
      : { accepted: false, reason: "Verified response contains no data." };

export class DelegationService {
  private readonly deps: DelegationServiceDependencies;

  constructor(deps: Partial<DelegationServiceDependencies> = {}) {
    this.deps = { ...DEFAULT_DEPENDENCIES, ...deps };
  }

  async delegate<T>(options: DelegationOptions): Promise<DelegationResult<T>> {
    const clientOptions = {
      baseUrl: options.agentUrl,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    };

    const capabilityClient = new this.deps.capabilityClientCtor(clientOptions);
    const handoffClient = new this.deps.handoffClientCtor(clientOptions);

    const capability = await capabilityClient.requireCapability(
      options.capability,
      options.capabilityVersion,
    );

    ensureOutputSchema(
      capability,
      options.capability,
      options.capabilityVersion,
    );

    const response = await handoffClient.handoff({
      capability: options.capability,
      capabilityVersion: options.capabilityVersion,
      task: options.task,
    });

    const statusHandler = STATUS_HANDLERS[response.status];
    const statusResult = statusHandler(response);
    return statusResult.accepted === false
      ? (statusResult as DelegationResult<T>)
      : resolveVerification(
          this.deps.verifier.verify<T>(
            response.result,
            capability.outputSchema!,
          ),
        );
  }
}
