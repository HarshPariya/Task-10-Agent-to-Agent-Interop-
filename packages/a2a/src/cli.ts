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

function parseArgs(args: readonly string[]): CliOptions {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (!argument?.startsWith("--")) {
      continue;
    }

    const key = argument.slice(2);
    const inlineSeparator = key.indexOf("=");

    if (inlineSeparator >= 0) {
      const name = key.slice(0, inlineSeparator);
      const value = key.slice(inlineSeparator + 1).trim();

      if (!name || !value) {
        throw new A2AError(
          "INVALID_REQUEST",
          `Invalid argument "${argument}".`,
        );
      }

      values.set(name, value);
      continue;
    }

    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      throw new A2AError("INVALID_REQUEST", `Missing value for --${key}.`);
    }

    values.set(key, value.trim());
    index += 1;
  }

  const task = sanitizeInput(values.get("task"));

  if (!task) {
    throw new A2AError(
      "INVALID_REQUEST",
      'The --task argument is required. Example: --task "verify this claim".',
    );
  }

  if (task.length > MAX_TASK_LENGTH) {
    throw new A2AError(
      "INVALID_REQUEST",
      `Task exceeds maximum length of ${MAX_TASK_LENGTH} characters.`,
    );
  }

  const agentValue = values.get("agent") ?? DEFAULT_AGENT;

  if (!AGENT_NAMES.has(agentValue)) {
    throw new A2AError(
      "INVALID_REQUEST",
      `Unknown agent "${agentValue}". Use honest, capability-lying, or injection.`,
    );
  }

  const capability = sanitizeInput(
    values.get("capability") ?? DEFAULT_CAPABILITY,
  );

  if (!capability.trim()) {
    throw new A2AError(
      "INVALID_REQUEST",
      "The --capability argument cannot be empty.",
    );
  }

  const host = sanitizeInput(values.get("host") ?? DEFAULT_HOST);

  const port = parseNumber(
    values.get("port"),
    DEFAULT_PORT,
    { min: 1, max: 65_535 },
    "port",
    "Port must be an integer between 1 and 65535.",
  );

  const timeoutMs = parseNumber(
    values.get("timeout"),
    3_000,
    { min: 100, max: 60_000 },
    "timeout",
    "Timeout must be an integer between 100 and 60000ms.",
  );

  const maxRetries = parseNumber(
    values.get("retries"),
    2,
    { min: 0, max: 10 },
    "retries",
    "Retries must be an integer between 0 and 10.",
  );

  return {
    agent: agentValue as AgentName,
    capability: capability.trim(),
    task,
    host,
    port,
    timeoutMs,
    maxRetries,
  };
}

const AGENT_NAMES = new Set(["honest", "capability-lying", "injection"]);

function parseNumber(
  raw: string | undefined,
  fallback: number,
  range: { min: number; max: number },
  name: string,
  hint: string,
): number {
  if (raw === undefined) return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < range.min || value > range.max) {
    throw new A2AError("INVALID_REQUEST", `Invalid ${name} "${raw}". ${hint}`);
  }

  return value;
}

function sanitizeInput(value: string | undefined): string {
  return value?.trim().replace(/[\x00-\x1f\x7f-\x9f]/g, "") ?? "";
}

function createAgent(agentName: AgentName) {
  const agents: Record<
    AgentName,
    () => HonestAgent | CapabilityLyingAgent | InjectionAgent
  > = {
    honest: () => new HonestAgent(),
    "capability-lying": () => new CapabilityLyingAgent(),
    injection: () => new InjectionAgent(),
  };

  return agents[agentName]();
}

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

    printResult(options, result);
  } finally {
    await server.stop();
  }
}

function printResult(
  options: CliOptions,
  result: Awaited<ReturnType<DelegationService["delegate"]>>,
): void {
  console.log("");
  console.log("Task 10 — A2A Delegation");
  console.log("=".repeat(50));
  console.log(`Agent      : ${options.agent}`);
  console.log(`Task       : ${options.task}`);
  console.log(`Capability : ${options.capability}@${CAPABILITY_VERSION}`);
  console.log(`Status     : ${result.accepted ? "ACCEPTED" : "REJECTED"}`);

  if (result.accepted) {
    console.log("");
    console.log("Verified Result");
    console.log("-".repeat(50));
    console.log(JSON.stringify(result.data, null, 2));
    return;
  }

  console.log("");
  console.log("Delegation rejected.");
  console.log(
    `Reason     : ${result.reason ?? "Unknown verification failure."}`,
  );
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
