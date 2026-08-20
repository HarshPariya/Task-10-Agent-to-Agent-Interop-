import type {
  InjectionDetectionResult,
  InjectionPattern,
} from "../types/index.js";

export const INJECTION_PATTERNS: readonly InjectionPattern[] = [
  {
    name: "instruction-override",
    pattern:
      /\b(ignore|disregard|forget)\b.{0,80}\b(previous|prior|above|system|instructions?)\b/i,
  },
  {
    name: "role-manipulation",
    pattern: /\b(you are now|act as|pretend to be|system message)\b/i,
  },
  {
    name: "prompt-extraction",
    pattern:
      /\b(reveal|show|print|expose|leak)\b.{0,80}\b(prompt|instructions?|internal|secret|data)\b/i,
  },
  {
    name: "instruction-execution",
    pattern:
      /\b(do not analyze|execute this|follow these instructions|new instructions?)\b/i,
  },
];

const isString = (value: unknown): value is string => typeof value === "string";
const isArray = Array.isArray;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !isArray(value);

const extractStrings = (value: unknown): string[] =>
  isString(value)
    ? [value]
    : isArray(value)
      ? value.flatMap(extractStrings)
      : isRecord(value)
        ? Object.values(value).flatMap(extractStrings)
        : [];

export class InjectionDetector {
  private readonly patterns: readonly InjectionPattern[];

  constructor(patterns: readonly InjectionPattern[] = INJECTION_PATTERNS) {
    this.patterns = patterns;
  }

  detect(value: unknown): InjectionDetectionResult {
    const texts = extractStrings(value);
    const matches = this.patterns
      .filter((rule) => texts.some((text) => rule.pattern.test(text)))
      .map((rule) => rule.name);

    return { detected: matches.length > 0, matches };
  }
}
