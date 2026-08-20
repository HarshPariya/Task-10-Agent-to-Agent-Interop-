import type { A2AErrorCode } from "../types/index.js";

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
