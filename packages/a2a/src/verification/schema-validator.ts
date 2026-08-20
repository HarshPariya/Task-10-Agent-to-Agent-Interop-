import { A2AError } from "../protocol/errors.js";
import type {
  A2AErrorCode,
  SchemaValidationResult,
  SchemaType,
  SchemaProperty,
} from "../types/verification.js";

type CheckResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly error: string };
const OK: CheckResult = { valid: true };
const fail = (error: string): CheckResult => ({ valid: false, error });

const firstError = (checks: CheckResult[]): CheckResult =>
  checks.find((r) => !r.valid) ?? OK;

const parseSchema = (text: string): SchemaProperty | null => {
  try {
    const parsed = JSON.parse(text) as SchemaProperty;
    return parsed.type === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const validateObject = (value: unknown, schema: SchemaProperty): CheckResult =>
  !isObject(value)
    ? fail("Expected object")
    : firstError(
        Object.entries(schema.properties ?? {}).flatMap(([key, propSchema]) => [
          !(key in value) && (schema.required ?? []).includes(key)
            ? fail(`Missing required property: ${key}`)
            : OK,
          key in value ? validateValue(value[key], propSchema) : OK,
        ]),
      );

const validateArray = (value: unknown, schema: SchemaProperty): CheckResult =>
  !Array.isArray(value)
    ? fail("Expected array")
    : schema.items
      ? firstError(
          (value as unknown[]).map((item, i) => {
            const r = validateValue(item, schema.items!);
            return r.valid ? OK : fail(`[${i}]: ${r.error}`);
          }),
        )
      : OK;

const validateString = (value: unknown, schema: SchemaProperty): CheckResult =>
  typeof value !== "string"
    ? fail("Expected string")
    : schema.enum && !schema.enum.includes(value)
      ? fail(`Value not in enum: ${schema.enum.join(", ")}`)
      : OK;

const validateNumber = (
  value: unknown,
  schema: SchemaProperty,
): CheckResult => {
  const num = typeof value === "number" && !Number.isNaN(value) ? value : NaN;
  return Number.isNaN(num)
    ? fail("Expected number")
    : schema.minimum !== undefined && num < schema.minimum
      ? fail(`Value below minimum: ${schema.minimum}`)
      : schema.maximum !== undefined && num > schema.maximum
        ? fail(`Value above maximum: ${schema.maximum}`)
        : OK;
};

const validateBoolean = (
  _value: unknown,
  _schema: SchemaProperty,
): CheckResult => (typeof _value === "boolean" ? OK : fail("Expected boolean"));

const VALIDATORS: Record<
  SchemaType,
  (value: unknown, schema: SchemaProperty) => CheckResult
> = {
  object: validateObject,
  array: validateArray,
  string: validateString,
  number: validateNumber,
  boolean: validateBoolean,
};

const validateValue = (value: unknown, schema: SchemaProperty): CheckResult => {
  const validator = VALIDATORS[schema.type];
  return validator
    ? validator(value, schema)
    : fail(`Unsupported type: ${schema.type}`);
};

export class SchemaValidator {
  private readonly schemaCache = new Map<string, SchemaProperty>();

  validate<T>(value: unknown, schemaText: string): SchemaValidationResult<T> {
    const schema = this.getSchema(schemaText);
    return schema
      ? (() => {
          const result = validateValue(value, schema);
          return result.valid
            ? { valid: true, data: value as T }
            : this.createError("SCHEMA_VALIDATION_FAILED", result.error);
        })()
      : this.createError("INVALID_RESPONSE", "Invalid output schema declared.");
  }

  private getSchema(schemaText: string): SchemaProperty | null {
    return this.schemaCache.get(schemaText) ?? this.parseAndCache(schemaText);
  }

  private parseAndCache(schemaText: string): SchemaProperty | null {
    const parsed = parseSchema(schemaText);
    return parsed ? (this.schemaCache.set(schemaText, parsed), parsed) : null;
  }

  private createError(
    code: A2AErrorCode,
    message: string,
  ): SchemaValidationResult<never> {
    return { valid: false, error: new A2AError(code, message) };
  }
}
