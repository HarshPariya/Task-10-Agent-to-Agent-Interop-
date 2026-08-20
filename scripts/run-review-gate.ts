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
] as const;

const REQUIRED_DIRECTORIES = [
  "packages/a2a/src/agents",
  "packages/a2a/src/client",
  "packages/a2a/src/metrics",
  "packages/a2a/src/orchestration",
  "packages/a2a/src/protocol",
  "packages/a2a/src/server",
  "packages/a2a/src/verification",
  "scripts",
] as const;

const SOURCE_FILES = [
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
] as const;

const pathExists = (path: string): Promise<boolean> =>
  access(path)
    .then(() => true)
    .catch(() => false);

const missingItems = async <T extends string>(
  items: readonly T[],
  base: string,
): Promise<T[]> => {
  const results = await Promise.all(
    items.map(async (item) => ({
      item,
      exists: await pathExists(resolve(base, item)),
    })),
  );
  return results.filter((r) => !r.exists).map((r) => r.item);
};

const checkRequiredFiles = (): Promise<ReviewCheck> =>
  missingItems(REQUIRED_FILES, ROOT_DIRECTORY).then((missing) => ({
    name: "Required files",
    passed: missing.length === 0,
    message:
      missing.length === 0
        ? "All required files are present."
        : `Missing: ${missing.join(", ")}`,
  }));

const checkRequiredDirectories = (): Promise<ReviewCheck> =>
  missingItems(REQUIRED_DIRECTORIES, ROOT_DIRECTORY).then((missing) => ({
    name: "Required directories",
    passed: missing.length === 0,
    message:
      missing.length === 0
        ? "All required directories are present."
        : `Missing: ${missing.join(", ")}`,
  }));

const validateGoldenRecord = (record: string): boolean => {
  try {
    const s = JSON.parse(record) as Record<string, unknown>;
    return (
      typeof s.id === "string" &&
      typeof s.agent === "string" &&
      typeof s.capability === "string" &&
      typeof s.capabilityVersion === "string" &&
      typeof s.task === "string" &&
      typeof s.expectedAccepted === "boolean"
    );
  } catch {
    return false;
  }
};

const checkGoldenDataset = (): Promise<ReviewCheck> => {
  const file = resolve(ROOT_DIRECTORY, "evals/golden-a2a.jsonl");
  return readFile(file, "utf8")
    .then((content) =>
      content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean),
    )
    .then((records) => ({
      name: "Golden evaluation dataset",
      passed: records.length > 0 && records.every(validateGoldenRecord),
      message:
        records.length > 0 && records.every(validateGoldenRecord)
          ? `${records.length} valid evaluation scenarios found.`
          : "Golden evaluation dataset is invalid or empty.",
    }))
    .catch(() => ({
      name: "Golden evaluation dataset",
      passed: false,
      message: "Golden evaluation dataset is invalid or empty.",
    }));
};

const checkSourceFiles = (): Promise<ReviewCheck> => {
  const sourceDirectory = resolve(ROOT_DIRECTORY, "packages/a2a/src");
  return Promise.all(
    SOURCE_FILES.map(async (file) => {
      const path = resolve(sourceDirectory, file);
      const exists = await pathExists(path);
      if (!exists) return file;
      const content = await readFile(path, "utf8");
      return content.trim() ? null : file;
    }),
  ).then((results) => {
    const emptyFiles = results.filter((f) => f !== null) as string[];
    return {
      name: "Source implementation",
      passed: emptyFiles.length === 0,
      message:
        emptyFiles.length === 0
          ? "All required source files contain implementation."
          : `Empty or missing: ${emptyFiles.join(", ")}`,
    };
  });
};

const runReviewGate = async (): Promise<void> => {
  const checks = await Promise.all([
    checkRequiredFiles(),
    checkRequiredDirectories(),
    checkGoldenDataset(),
    checkSourceFiles(),
  ]);

  console.log("\nTask 10 — A2A Review Gate");
  console.log("=".repeat(50));

  checks.forEach((check) =>
    console.log(
      `${check.passed ? "PASS" : "FAIL"}  ${check.name}\n      ${check.message}`,
    ),
  );

  const passed = checks.every((c) => c.passed);

  console.log("\n" + "-".repeat(50));
  console.log(`Review gate: ${passed ? "PASS" : "FAIL"}`);

  if (!passed) process.exitCode = 1;
};

await runReviewGate();
