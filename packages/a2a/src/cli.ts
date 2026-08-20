import {
  CapabilityLyingAgent,
  DelegationService,
  ExternalAgentServer,
  HonestAgent,
  InjectionAgent,
} from "./index.js";
import { A2AError } from "./protocol/errors.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4310;
const DEFAULT_AGENT = "honest";
const DEFAULT_CAPABILITY = "claim-verification";
const CAPABILITY_VERSION = "1.0.0";
const MAX_TASK_LENGTH = 10_000;

type AgentName = "honest" | "capability-lying" | "injection";

interface CliOptions {
  agent: AgentName;
  capability: string;
  task: string;
  host: string;
  port: number;
  timeoutMs: number;
  maxRetries: number;
}

const AGENT_NAMES = new Set<AgentName>([
  "honest",
  "capability-lying",
  "injection",
]);

const AGENT_FACTORY: Record<
  AgentName,
  () => HonestAgent | CapabilityLyingAgent | InjectionAgent
> = {
  honest: () => new HonestAgent(),
  "capability-lying": () => new CapabilityLyingAgent(),
  injection: () => new InjectionAgent(),
};

const sanitize = (value: string | undefined): string =>
  value?.trim().replace(/[\x00-\x1f\x7f-\x9f]/g, "") ?? "";

type Validator<T> = (input: string | undefined) => T;

const intValidator =
  (
    fallback: number,
    min: number,
    max: number,
    name: string,
  ): Validator<number> =>
  (raw) =>
    raw === undefined
      ? fallback
      : (() => {
          const input = raw;
          const value = Number(input);
          return Number.isInteger(value) && value >= min && value <= max
            ? value
            : (() => {
                throw new A2AError(
                  "INVALID_REQUEST",
                  `Invalid ${name} "${input}". Must be integer ${min}-${max}.`,
                );
              })();
        })();

const requiredValidator =
  (message: string): Validator<string> =>
  (raw) => {
    const trimmed = raw?.trim() ?? "";
    return trimmed
      ? trimmed
      : (() => {
          throw new A2AError("INVALID_REQUEST", message);
        })();
  };

const maxLengthValidator =
  (max: number, name: string): Validator<string> =>
  (value) =>
    value === undefined
      ? (() => {
          throw new A2AError("INVALID_REQUEST", `${name} is required.`);
        })()
      : value.length <= max
        ? value
        : (() => {
            throw new A2AError(
              "INVALID_REQUEST",
              `${name} exceeds maximum length of ${max} characters.`,
            );
          })();

const enumValidator =
  <T extends string>(allowed: Set<T>, name: string): Validator<T> =>
  (raw) =>
    allowed.has(raw as T)
      ? (raw as T)
      : (() => {
          throw new A2AError(
            "INVALID_REQUEST",
            `Unknown ${name} "${raw}". Use ${[...allowed].join(", ")}.`,
          );
        })();

const optionalValidator =
  <T>(fallback: T, transform: (raw: string) => T): Validator<T> =>
  (raw) =>
    raw !== undefined ? transform(raw) : fallback;

const parseArgs = (args: readonly string[]): CliOptions => {
  const raw = new Map<string, string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    arg?.startsWith("--")
      ? (() => {
          const eqIndex = arg.indexOf("=");
          return eqIndex > 2
            ? (() => {
                const key = arg.slice(2, eqIndex);
                const value = arg.slice(eqIndex + 1).trim();
                return key && value
                  ? raw.set(key, value)
                  : (() => {
                      throw new A2AError(
                        "INVALID_REQUEST",
                        `Invalid argument "${arg}".`,
                      );
                    })();
              })()
            : (() => {
                const key = arg.slice(2);
                const value = args[i + 1];
                return value && !value.startsWith("--")
                  ? (raw.set(key, value.trim()), (i++, undefined))
                  : (() => {
                      throw new A2AError(
                        "INVALID_REQUEST",
                        `Missing value for --${key}.`,
                      );
                    })();
              })();
        })()
      : undefined;
  }

  const get = (key: string, fallback?: string): string | undefined =>
    raw.get(key) ?? fallback;

  const taskRequired = requiredValidator(
    'The --task argument is required. Example: --task "verify this claim".',
  );
  const taskMaxLength = maxLengthValidator(MAX_TASK_LENGTH, "Task");
  const taskValidator: Validator<string> = (raw) =>
    taskMaxLength(taskRequired(raw));

  return {
    task: taskValidator(get("task")),
    agent: enumValidator(AGENT_NAMES, "agent")(get("agent", DEFAULT_AGENT)),
    capability: requiredValidator("The --capability argument cannot be empty.")(
      get("capability", DEFAULT_CAPABILITY),
    ),
    host: optionalValidator(DEFAULT_HOST, sanitize)(get("host", DEFAULT_HOST)),
    port: intValidator(
      DEFAULT_PORT,
      1,
      65_535,
      "port",
    )(get("port", String(DEFAULT_PORT))),
    timeoutMs: intValidator(
      3_000,
      100,
      60_000,
      "timeout",
    )(get("timeout", "3000")),
    maxRetries: intValidator(2, 0, 10, "retries")(get("retries", "2")),
  };
};

const createAgent = (agentName: AgentName) => AGENT_FACTORY[agentName]();

const formatResult = (
  options: CliOptions,
  result: Awaited<ReturnType<DelegationService["delegate"]>>,
): string => {
  const base = [
    "",
    "Task 10 — A2A Delegation",
    "=".repeat(50),
    `Agent      : ${options.agent}`,
    `Task       : ${options.task}`,
    `Capability : ${options.capability}@${CAPABILITY_VERSION}`,
    `Status     : ${result.accepted ? "ACCEPTED" : "REJECTED"}`,
  ];

  return result.accepted
    ? [
        ...base,
        "",
        "Verified Result",
        "-".repeat(50),
        JSON.stringify(result.data, null, 2),
      ].join("\n")
    : [
        ...base,
        "",
        "Delegation rejected.",
        `Reason     : ${result.reason ?? "Unknown verification failure."}`,
      ].join("\n");
};

async function run(options: CliOptions): Promise<void> {
  const agent = createAgent(options.agent);
  const server = new ExternalAgentServer(agent, {
    host: options.host,
    port: options.port,
  });
  await server.start();

  try {
    const delegationService = new DelegationService();
    const result = await delegationService.delegate<unknown>({
      agentUrl: `http://${options.host}:${options.port}`,
      capability: options.capability,
      capabilityVersion: CAPABILITY_VERSION,
      task: options.task,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
    });
    console.log(formatResult(options, result));
  } finally {
    await server.stop();
  }
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));
    await run(options);
  } catch (error) {
    const message =
      error instanceof A2AError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unexpected CLI error.";
    console.error(`A2A CLI error: ${message}`);
    process.exitCode = 1;
  }
}

await main();
