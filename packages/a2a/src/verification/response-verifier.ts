import { InjectionDetector } from "./injection-detector.js";
import { SchemaValidator } from "./schema-validator.js";
import type {
  VerificationResult,
  VerifyStep,
  InjectionDetectionResult,
  SchemaValidationResult,
} from "../types/index.js";

export class ResponseVerifier {
  private readonly schemaValidator: SchemaValidator;
  private readonly injectionDetector: InjectionDetector;

  private readonly validateSchema = (
    data: unknown,
    schema: string,
  ): VerificationResult<unknown> | null => {
    const result: SchemaValidationResult<unknown> =
      this.schemaValidator.validate(data, schema);
    return result.valid
      ? null
      : {
          accepted: false,
          reason: result.error?.message ?? "Schema validation failed.",
        };
  };

  private readonly checkInjection = (
    data: unknown,
  ): VerificationResult<unknown> | null => {
    const injectionResult = this.injectionDetector.detect(data);
    return injectionResult.detected
      ? {
          accepted: false,
          reason: "Response contains injection attempt.",
          injection: injectionResult,
        }
      : null;
  };

  private readonly steps: readonly VerifyStep[];

  constructor(
    schemaValidator = new SchemaValidator(),
    injectionDetector = new InjectionDetector(),
  ) {
    this.schemaValidator = schemaValidator;
    this.injectionDetector = injectionDetector;
    this.steps = [this.validateSchema, this.checkInjection];
  }

  verify<T>(response: unknown, outputSchema: string): VerificationResult<T> {
    const initial: VerificationResult<unknown> = {
      accepted: true,
      data: response,
    };

    const result = this.steps.reduce<VerificationResult<unknown> | null>(
      (acc, step) => acc ?? step(initial.data!, outputSchema),
      null,
    );

    return (result ?? initial) as VerificationResult<T>;
  }
}
