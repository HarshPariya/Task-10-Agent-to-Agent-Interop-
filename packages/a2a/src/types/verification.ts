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

export interface SchemaValidationResult<T> {
  readonly valid: boolean;
  readonly data?: T;
  readonly error?: A2AError;
}

export type SchemaType = "object" | "array" | "string" | "number" | "boolean";

export interface SchemaProperty {
  readonly type: SchemaType;
  readonly enum?: readonly unknown[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly items?: SchemaProperty;
  readonly required?: readonly string[];
  readonly properties?: Record<string, SchemaProperty>;
}

export interface InjectionDetectionResult {
  readonly detected: boolean;
  readonly matches: readonly string[];
}

export interface InjectionPattern {
  readonly name: string;
  readonly pattern: RegExp;
}

export type VerifyStep = (
  data: unknown,
  schema: string,
) => VerificationResult<unknown> | null;

export interface VerificationResult<T> {
  readonly accepted: boolean;
  readonly data?: T;
  readonly reason?: string;
  readonly injection?: InjectionDetectionResult;
}

export interface A2AError {
  readonly code: A2AErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}
