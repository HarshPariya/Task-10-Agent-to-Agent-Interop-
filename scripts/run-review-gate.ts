import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface ReviewCheck {
  name: string;
  passed: boolean;
  message: string;
}

const ROOT_DIRECTORY = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "..",
);

const REQUIRED_FILES = [
  "README.md",
  "DESIGN.md",
  "ARCHITECTURE.md",
  "RESULTS.md",
  "NOTES.md",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "evals/golden-a2a.jsonl",
];

const REQUIRED_DIRECTORIES = [
  "packages/a2a/src/agents",
  "packages/a2a/src/client",
  "packages/a2a/src/metrics",
  "packages/a2a/src/orchestration",
  "packages/a2a/src/protocol",
  "packages/a2a/src/server",
  "packages/a2a/src/verification",
  "scripts",
];

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function checkRequiredFiles(): Promise<ReviewCheck> {
  const missing: string[] = [];

  for (const file of REQUIRED_FILES) {
    const exists = await pathExists(resolve(ROOT_DIRECTORY, file));

    if (!exists) {
      missing.push(file);
    }
  }

  return {
    name: "Required files",
    passed: missing.length === 0,
    message:
      missing.length === 0
        ? "All required files are present."
        : `Missing: ${missing.join(", ")}`,
  };
}

async function checkRequiredDirectories(): Promise<ReviewCheck> {
  const missing: string[] = [];

  for (const directory of REQUIRED_DIRECTORIES) {
    const exists = await pathExists(resolve(ROOT_DIRECTORY, directory));

    if (!exists) {
      missing.push(directory);
    }
  }

  return {
    name: "Required directories",
    passed: missing.length === 0,
    message:
      missing.length === 0
        ? "All required directories are present."
        : `Missing: ${missing.join(", ")}`,
  };
}

async function checkGoldenDataset(): Promise<ReviewCheck> {
  const file = resolve(ROOT_DIRECTORY, "evals/golden-a2a.jsonl");
  const content = await readFile(file, "utf8");

  const records = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const valid = records.every((record) => {
    try {
      const scenario = JSON.parse(record) as Record<string, unknown>;

      return (
        typeof scenario.id === "string" &&
        typeof scenario.agent === "string" &&
        typeof scenario.capability === "string" &&
        typeof scenario.capabilityVersion === "string" &&
        typeof scenario.task === "string" &&
        typeof scenario.expectedAccepted === "boolean"
      );
    } catch {
      return false;
    }
  });

  return {
    name: "Golden evaluation dataset",
    passed: records.length > 0 && valid,
    message:
      records.length > 0 && valid
        ? `${records.length} valid evaluation scenarios found.`
        : "Golden evaluation dataset is invalid or empty.",
  };
}

async function checkSourceFiles(): Promise<ReviewCheck> {
  const sourceDirectory = resolve(ROOT_DIRECTORY, "packages/a2a/src");
  const files = [
    "config.ts",
    "index.ts",
    "protocol/capability.ts",
    "protocol/errors.ts",
    "protocol/handoff.ts",
    "client/capability-client.ts",
    "client/handoff-client.ts",
    "orchestration/delegation-service.ts",
    "server/external-agent-server.ts",
    "verification/injection-detector.ts",
    "verification/response-verifier.ts",
    "verification/schema-validator.ts",
    "metrics/metrics.ts",
    "agents/honest-agent.ts",
    "agents/capability-lying-agent.ts",
    "agents/injection-agent.ts",
  ];

  const emptyFiles: string[] = [];

  for (const file of files) {
    const path = resolve(sourceDirectory, file);

    if (!(await pathExists(path))) {
      emptyFiles.push(file);
      continue;
    }

    const content = await readFile(path, "utf8");

    if (!content.trim()) {
      emptyFiles.push(file);
    }
  }

  return {
    name: "Source implementation",
    passed: emptyFiles.length === 0,
    message:
      emptyFiles.length === 0
        ? "All required source files contain implementation."
        : `Empty or missing: ${emptyFiles.join(", ")}`,
  };
}

async function runReviewGate(): Promise<void> {
  const checks = await Promise.all([
    checkRequiredFiles(),
    checkRequiredDirectories(),
    checkGoldenDataset(),
    checkSourceFiles(),
  ]);

  console.log("\nTask 10 — A2A Review Gate");
  console.log("=".repeat(50));

  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"}  ${check.name}`);
    console.log(`      ${check.message}`);
  }

  const passed = checks.every((check) => check.passed);

  console.log("\n" + "-".repeat(50));
  console.log(`Review gate: ${passed ? "PASS" : "FAIL"}`);

  if (!passed) {
    process.exitCode = 1;
  }
}

await runReviewGate();
