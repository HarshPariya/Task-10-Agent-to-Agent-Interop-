export interface EvaluationResult {
  variant: "honest" | "capability-lying" | "injection";
  accepted: boolean;
  schemaViolation: boolean;
  verificationLatencyMs: number;
}

export interface MetricsSnapshot {
  successfulDelegationRate: number;
  failClosedRate: number;
  schemaViolationCatchRate: number;
  averageVerificationLatencyMs: number;
}

export class MetricsCollector {
  private readonly results: EvaluationResult[] = [];

  record(result: EvaluationResult): void {
    this.results.push(result);
  }

  getSnapshot(): MetricsSnapshot {
    const honest = this.results.filter((result) => result.variant === "honest");

    const misbehaving = this.results.filter(
      (result) => result.variant !== "honest",
    );

    const schemaViolations = this.results.filter(
      (result) => result.schemaViolation,
    );

    const caughtSchemaViolations = schemaViolations.filter(
      (result) => !result.accepted,
    );

    const totalLatency = this.results.reduce(
      (total, result) => total + result.verificationLatencyMs,
      0,
    );

    return {
      successfulDelegationRate: this.rate(
        honest.filter((result) => result.accepted).length,
        honest.length,
      ),
      failClosedRate: this.rate(
        misbehaving.filter((result) => !result.accepted).length,
        misbehaving.length,
      ),
      schemaViolationCatchRate: this.rate(
        caughtSchemaViolations.length,
        schemaViolations.length,
      ),
      averageVerificationLatencyMs:
        this.results.length > 0 ? totalLatency / this.results.length : 0,
    };
  }

  getResults(): readonly EvaluationResult[] {
    return [...this.results];
  }

  reset(): void {
    this.results.length = 0;
  }

  private rate(successes: number, total: number): number {
    return total === 0 ? 0 : (successes / total) * 100;
  }
}
