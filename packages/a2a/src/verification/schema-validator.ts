import { A2AError, type A2AErrorCode } from "../protocol/errors.js";

export interface SchemaValidationResult<T> {
  valid: boolean;
  data?: T;
  error?: A2AError;
}

interface SchemaProperty {
  type: "object" | "array" | "string" | "number" | "boolean";
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  items?: SchemaProperty;
  required?: string[];
  properties?: Record<string, SchemaProperty>;
}

function parseSchema(text: string): SchemaProperty | null {
  try {
    return JSON.parse(text) as SchemaProperty;
  } catch {
    return null;
  }
}

type CheckResult = { valid: boolean; error?: string };
type CheckFn = () => CheckResult;

const firstError = (checks: CheckResult[]): CheckResult =>
  checks.find((r) => !r.valid) ?? { valid: true };

const runChecks = (...checks: CheckFn[]): CheckResult =>
  firstError(checks.map((fn) => fn()));

function validateObject(value: unknown, schema: SchemaProperty): CheckResult {
  const typeCheck: CheckFn = () =>
    typeof value === "object" && value !== null
      ? { valid: true }
      : { valid: false, error: "Expected object" };

  const obj = value as Record<string, unknown>;
  const props = schema.properties ?? {};
  const required = schema.required ?? [];

  const propChecks = Object.entries(props).flatMap(
    ([key, propSchema]): CheckFn[] => {
      const missing = !(key in obj);
      const requiredCheck: CheckFn = () =>
        missing && required.includes(key)
          ? { valid: false, error: `Missing required property: ${key}` }
          : { valid: true };

      const valueCheck: CheckFn = () =>
        missing ? { valid: true } : validateValue(obj[key], propSchema);

      return [requiredCheck, valueCheck];
    },
  );

  return runChecks(typeCheck, ...propChecks);
}

function validateArray(value: unknown, schema: SchemaProperty): CheckResult {
  const typeCheck: CheckFn = () =>
    Array.isArray(value)
      ? { valid: true }
      : { valid: false, error: "Expected array" };

  const itemsCheck: CheckFn = () => {
    if (!schema.items) return { valid: true };
    const checks = (value as unknown[]).map((item, i): CheckResult => {
      const result = validateValue(item, schema.items!);
      return result.valid
        ? { valid: true }
        : { valid: false, error: `[${i}]: ${result.error}` };
    });
    return firstError(checks);
  };

  return runChecks(typeCheck, itemsCheck);
}

function validateString(value: unknown, schema: SchemaProperty): CheckResult {
  return runChecks(
    () =>
      typeof value === "string"
        ? { valid: true }
        : { valid: false, error: "Expected string" },
    () =>
      schema.enum && !schema.enum.includes(value)
        ? {
            valid: false,
            error: `Value not in enum: ${schema.enum.join(", ")}`,
          }
        : { valid: true },
  );
}

function validateNumber(value: unknown, schema: SchemaProperty): CheckResult {
  const num =
    typeof value === "number" && !Number.isNaN(value) ? (value as number) : NaN;
  return runChecks(
    () =>
      Number.isNaN(num)
        ? { valid: false, error: "Expected number" }
        : { valid: true },
    () =>
      schema.minimum !== undefined && num < schema.minimum
        ? { valid: false, error: `Value below minimum: ${schema.minimum}` }
        : { valid: true },
    () =>
      schema.maximum !== undefined && num > schema.maximum
        ? { valid: false, error: `Value above maximum: ${schema.maximum}` }
        : { valid: true },
  );
}

function validateBoolean(value: unknown): CheckResult {
  return runChecks(() =>
    typeof value === "boolean"
      ? { valid: true }
      : { valid: false, error: "Expected boolean" },
  );
}

const VALIDATORS: Record<
  SchemaProperty["type"],
  (value: unknown, schema: SchemaProperty) => CheckResult
> = {
  object: validateObject,
  array: validateArray,
  string: validateString,
  number: validateNumber,
  boolean: validateBoolean,
};

function validateValue(value: unknown, schema: SchemaProperty): CheckResult {
  const validator = VALIDATORS[schema.type];
  return validator
    ? validator(value, schema)
    : { valid: false, error: `Unsupported type: ${schema.type}` };
}

export class SchemaValidator {
  private readonly schemaCache = new Map<string, SchemaProperty>();

  validate<T>(value: unknown, schemaText: string): SchemaValidationResult<T> {
    const schema = this.getSchema(schemaText);

    if (!schema) {
      return this.error(
        "INVALID_RESPONSE",
        "External agent declared an invalid output schema.",
      );
    }

    if (schema.type !== "object") {
      return this.error("INVALID_RESPONSE", "Root schema must be an object");
    }

    const result = validateValue(value, schema);
    return result.valid
      ? { valid: true, data: value as T }
      : this.error(
          "SCHEMA_VALIDATION_FAILED",
          result.error ?? "Validation failed",
        );
  }

  private getSchema(schemaText: string): SchemaProperty | null {
    const cached = this.schemaCache.get(schemaText);
    if (cached) return cached;

    const parsed = parseSchema(schemaText);
    if (!parsed || parsed.type !== "object") return null;

    this.schemaCache.set(schemaText, parsed);
    return parsed;
  }

  private error(
    code: A2AErrorCode,
    message: string,
  ): SchemaValidationResult<never> {
    return { valid: false, error: new A2AError(code, message) };
  }
}
