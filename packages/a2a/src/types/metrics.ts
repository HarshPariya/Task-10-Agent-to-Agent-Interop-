export type EvaluationVariant = "honest" | "capability-lying" | "injection";

export interface EvaluationResult {
  readonly variant: EvaluationVariant;
  readonly accepted: boolean;
  readonly schemaViolation: boolean;
  readonly verificationLatencyMs: number;
}

export interface MetricsSnapshot {
  readonly successfulDelegationRate: number;
  readonly failClosedRate: number;
  readonly schemaViolationCatchRate: number;
  readonly averageVerificationLatencyMs: number;
}