import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [, , command = "", ...args] = process.argv;

const ROOT_DIR = resolve(import.meta.dirname, "..");

const ENTRY_POINTS: Record<string, string> = {
  run: resolve(ROOT_DIR, "packages/a2a/src/cli.ts"),
  eval: resolve(ROOT_DIR, "scripts/run-evaluation.ts"),
};

const entryPoint = ENTRY_POINTS[command];

if (!entryPoint) {
  console.error("Usage: pnpm a2a <run|eval> [options]");
  process.exitCode = 1;
} else {
  process.argv = [process.argv[0] ?? process.execPath, entryPoint, ...args];

  try {
    await import(pathToFileURL(entryPoint).href);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected A2A CLI error.";

    console.error(`A2A command failed: ${message}`);
    process.exitCode = 1;
  }
}
