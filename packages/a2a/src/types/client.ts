import type {
  Capability,
  CapabilityManifest,
  HandoffRequest,
  HandoffResponse,
} from "./core.js";
import type { VerificationResult } from "./verification.js";

export type {
  Capability,
  CapabilityManifest,
  HandoffRequest,
  HandoffResponse,
  VerificationResult,
};

export interface ResponseVerifier {
  verify<T>(response: unknown, outputSchema: string): VerificationResult<T>;
}

export interface CapabilityClientInterface {
  discover(force?: boolean): Promise<CapabilityManifest>;
  requireCapability(name: string, version: string): Promise<Capability>;
  clearCache(): void;
}

export interface HandoffClientInterface {
  getCapabilities(): Promise<CapabilityManifest>;
  handoff(options: HandoffOptions): Promise<HandoffResponse>;
}

export interface CapabilityClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly headers?: Record<string, string>;
}

export type CapabilityClientOptionsAlias = CapabilityClientOptions;

export interface HandoffClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly headers?: Record<string, string>;
  readonly maxRetries?: number;
}

export interface HandoffOptions {
  readonly capability: string;
  readonly capabilityVersion: string;
  readonly task: string;
}

export interface DelegationOptions {
  readonly agentUrl: string;
  readonly capability: string;
  readonly capabilityVersion: string;
  readonly task: string;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
}

export interface DelegationResult<T> {
  readonly accepted: boolean;
  readonly data?: T;
  readonly reason?: string;
}

export interface DelegationServiceDependencies {
  readonly verifier: ResponseVerifier;
  readonly capabilityClientCtor: new (
    options: CapabilityClientOptions,
  ) => CapabilityClientInterface;
  readonly handoffClientCtor: new (
    options: HandoffClientOptions,
  ) => HandoffClientInterface;
}
