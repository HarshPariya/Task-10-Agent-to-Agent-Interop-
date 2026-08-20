export interface InjectionDetectionResult {
  detected: boolean;
  matches: string[];
}

interface InjectionPattern {
  name: string;
  pattern: RegExp;
}

const INJECTION_PATTERNS: readonly InjectionPattern[] = [
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

export class InjectionDetector {
  detect(value: unknown): InjectionDetectionResult {
    const texts = this.collectText(value);

    const matches = INJECTION_PATTERNS.filter((rule) =>
      texts.some((text) => rule.pattern.test(text)),
    ).map((rule) => rule.name);

    return { detected: matches.length > 0, matches };
  }

  private collectText(value: unknown, acc: string[] = []): string[] {
    if (typeof value === "string") {
      acc.push(value);
    } else if (Array.isArray(value)) {
      value.forEach((item) => this.collectText(item, acc));
    } else if (value && typeof value === "object") {
      Object.values(value).forEach((item) => this.collectText(item, acc));
    }
    return acc;
  }
}
