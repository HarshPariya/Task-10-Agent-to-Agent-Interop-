import {
  InjectionDetector,
  type InjectionDetectionResult,
} from "./injection-detector.js";
import {
  SchemaValidator,
  type SchemaValidationResult,
} from "./schema-validator.js";

export interface VerificationResult<T> {
  accepted: boolean;
  data?: T;
  reason?: string;
  injection?: InjectionDetectionResult;
}

export class ResponseVerifier {
  private readonly schemaValidator: SchemaValidator;
  private readonly injectionDetector: InjectionDetector;

  constructor(
    schemaValidator = new SchemaValidator(),
    injectionDetector = new InjectionDetector(),
  ) {
    this.schemaValidator = schemaValidator;
    this.injectionDetector = injectionDetector;
  }

  verify<T>(response: unknown, outputSchema: string): VerificationResult<T> {
    const schemaResult = this.schemaValidator.validate<T>(
      response,
      outputSchema,
    );

    if (!schemaResult.valid) {
      return {
        accepted: false,
        reason: schemaResult.error?.message ?? "Schema validation failed.",
      };
    }

    const data = schemaResult.data;
    if (data === undefined) {
      return { accepted: false, reason: "Validation produced no data." };
    }

    const injectionResult = this.injectionDetector.detect(data);

    if (injectionResult.detected) {
      return {
        accepted: false,
        reason: "Response contains injection attempt.",
        injection: injectionResult,
      };
    }

    return { accepted: true, data, injection: injectionResult };
  }
}
