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

export class A2AError extends Error {
  constructor(
    public readonly code: A2AErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "A2AError";
  }
}
