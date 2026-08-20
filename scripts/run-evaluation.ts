import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CapabilityLyingAgent,
  DelegationService,
  ExternalAgentServer,
  HonestAgent,
  InjectionAgent,
  MetricsCollector,
} from "../packages/a2a/src/index.js";

interface GoldenScenario {
  id: string;
  agent: "honest" | "capability-lying" | "injection";
  capability: string;
  capabilityVersion: string;
  task: string;
  expectedAccepted: boolean;
  expectedStatus: "success" | "rejected" | "error";
}

interface ScenarioResult {
  id: string;
  agent: GoldenScenario["agent"];
  passed: boolean;
  accepted: boolean;
  expectedAccepted: boolean;
  latencyMs: number;
  schemaViolation: boolean;
  reason?: string;
}

const HOST = "127.0.0.1";
const BASE_PORT = 4310;
const TIMEOUT_MS = 3_000;

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const GOLDEN_FILE = resolve(
  SCRIPT_DIRECTORY,
  "..",
  "evals",
  "golden-a2a.jsonl",
);
const RESULTS_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..", "results");

function createAgent(type: GoldenScenario["agent"]) {
  const agents = {
    honest: () => new HonestAgent(),
    "capability-lying": () => new CapabilityLyingAgent(),
    injection: () => new InjectionAgent(),
  } as const;

  return agents[type]();
}

function getPort(index: number): number {
  return BASE_PORT + index;
}

async function loadScenarios(): Promise<GoldenScenario[]> {
  const content = await readFile(GOLDEN_FILE, "utf8");

  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as GoldenScenario;
      } catch (error) {
        throw new Error(`Invalid JSONL record at line ${index + 1}.`, {
          cause: error,
        });
      }
    });
}

async function runScenario(
  scenario: GoldenScenario,
  index: number,
  metrics: MetricsCollector,
): Promise<ScenarioResult> {
  const agent = createAgent(scenario.agent);
  const port = getPort(index);

  const server = new ExternalAgentServer(agent, {
    host: HOST,
    port,
  });

  const service = new DelegationService();
  const startedAt = performance.now();

  try {
    await server.start();

    const result = await service.delegate<unknown>({
      agentUrl: `http://${HOST}:${port}`,
      capability: scenario.capability,
      capabilityVersion: scenario.capabilityVersion,
      task: scenario.task,
      timeoutMs: TIMEOUT_MS,
    });

    const latencyMs = performance.now() - startedAt;
    const passed = result.accepted === scenario.expectedAccepted;

    metrics.record({
      variant: scenario.agent,
      accepted: result.accepted,
      schemaViolation: scenario.agent === "injection",
      verificationLatencyMs: latencyMs,
    });

    return {
      id: scenario.id,
      agent: scenario.agent,
      passed,
      accepted: result.accepted,
      expectedAccepted: scenario.expectedAccepted,
      latencyMs,
      schemaViolation: scenario.agent === "injection",
      ...(result.reason ? { reason: result.reason } : {}),
    };
  } catch (error) {
    const latencyMs = performance.now() - startedAt;
    const reason =
      error instanceof Error ? error.message : "Unknown evaluation error.";

    metrics.record({
      variant: scenario.agent,
      accepted: false,
      schemaViolation: scenario.agent === "injection",
      verificationLatencyMs: latencyMs,
    });

    return {
      id: scenario.id,
      agent: scenario.agent,
      passed: scenario.expectedAccepted === false,
      accepted: false,
      expectedAccepted: scenario.expectedAccepted,
      latencyMs,
      schemaViolation: scenario.agent === "injection",
      reason,
    };
  } finally {
    await server.stop();
  }
}

function printResults(
  results: ScenarioResult[],
  metrics: MetricsCollector,
): void {
  const snapshot = metrics.getSnapshot();

  console.log("\nTask 10 — A2A Golden Evaluation");
  console.log("=".repeat(50));

  for (const result of results) {
    const status = result.passed ? "PASS" : "FAIL";
    const accepted = result.accepted ? "accepted" : "rejected";

    console.log(
      `${status}  ${result.id.padEnd(14)} ${result.agent.padEnd(
        17,
      )} ${accepted.padEnd(9)} ${result.latencyMs.toFixed(2)}ms`,
    );

    if (!result.passed && result.reason) {
      console.log(`      reason: ${result.reason}`);
    }
  }

  console.log("\nMetrics");
  console.log("-".repeat(50));
  console.log(
    `Successful delegation rate : ${snapshot.successfulDelegationRate.toFixed(
      1,
    )}%`,
  );
  console.log(
    `Fail-closed rate            : ${snapshot.failClosedRate.toFixed(1)}%`,
  );
  console.log(
    `Schema-violation catch rate : ${snapshot.schemaViolationCatchRate.toFixed(
      1,
    )}%`,
  );
  console.log(
    `Average verification latency: ${snapshot.averageVerificationLatencyMs.toFixed(
      2,
    )}ms`,
  );

  console.log(
    `\nResult: ${results.filter((result) => result.passed).length}/${
      results.length
    } scenarios passed.`,
  );
}

async function saveResults(
  results: ScenarioResult[],
  metrics: MetricsCollector,
): Promise<void> {
  const snapshot = metrics.getSnapshot();

  const output = {
    timestamp: new Date().toISOString(),
    totalScenarios: results.length,
    passedScenarios: results.filter((result) => result.passed).length,
    results,
    metrics: {
      successfulDelegationRate: snapshot.successfulDelegationRate,
      failClosedRate: snapshot.failClosedRate,
      schemaViolationCatchRate: snapshot.schemaViolationCatchRate,
      averageVerificationLatencyMs: snapshot.averageVerificationLatencyMs,
    },
  };

  const outputPath = resolve(RESULTS_DIRECTORY, "evaluation-results.json");
  await writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${outputPath}`);
}

async function main(): Promise<void> {
  const scenarios = await loadScenarios();

  if (scenarios.length === 0) {
    throw new Error("Golden evaluation set is empty.");
  }

  const metrics = new MetricsCollector();
  const results: ScenarioResult[] = [];

  for (let index = 0; index < scenarios.length; index += 1) {
    const scenario = scenarios[index];

    if (!scenario) {
      continue;
    }

    results.push(await runScenario(scenario, index, metrics));
  }

  printResults(results, metrics);
  await saveResults(results, metrics);

  if (results.some((result) => !result.passed)) {
    process.exitCode = 1;
  }
}

await main();
