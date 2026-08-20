import {
  capabilityManifestSchema,
  findCapability,
} from "../protocol/capability.js";
import { A2AError } from "../protocol/errors.js";
import type {
  Capability,
  CapabilityManifest,
  CapabilityClientOptions,
} from "../types/client.js";

const DEFAULT_TIMEOUT_MS = 5_000;
const ACCEPT_HEADER = "application/json";

const CLASSIFIERS = [
  (e: unknown) => (e instanceof A2AError ? e : null),
  (e: unknown) =>
    e instanceof DOMException && e.name === "AbortError"
      ? new A2AError("REQUEST_TIMEOUT", "Discovery timed out.")
      : null,
] as const;

const classifyError = (err: unknown): A2AError =>
  CLASSIFIERS.reduce((acc, c) => acc ?? c(err), null as A2AError | null) ??
  new A2AError("CAPABILITY_DISCOVERY_FAILED", "Discovery failed.", err);

const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => A2AError,
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return promise
    .finally(() => clearTimeout(timer))
    .catch((e) =>
      e instanceof DOMException && e.name === "AbortError"
        ? Promise.reject(onTimeout())
        : Promise.reject(e),
    );
};

const validateResponse = (response: Response): void =>
  response.ok
    ? undefined
    : (() => {
        throw new A2AError(
          "CAPABILITY_DISCOVERY_FAILED",
          `HTTP ${response.status}`,
        );
      })();

const parseManifest = (payload: unknown): CapabilityManifest => {
  const parsed = capabilityManifestSchema.safeParse(payload);
  return parsed.success
    ? parsed.data
    : (() => {
        throw new A2AError(
          "INVALID_CAPABILITY_MANIFEST",
          "Invalid manifest.",
          parsed.error,
        );
      })();
};

const requireCapability = (
  manifest: CapabilityManifest,
  name: string,
  version: string,
): Capability => {
  const capability = findCapability(manifest, name, version);
  return (
    capability ??
    (() => {
      throw new A2AError(
        "CAPABILITY_NOT_SUPPORTED",
        `Capability "${name}@${version}" not supported.`,
      );
    })()
  );
};

export class CapabilityClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;
  private readonly cache = new Map<string, CapabilityManifest>();

  constructor(options: CapabilityClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.headers = { Accept: ACCEPT_HEADER, ...options.headers };
  }

  async discover(force = false): Promise<CapabilityManifest> {
    const cached = this.cache.get(this.baseUrl);
    return force || !cached
      ? (async () => {
          const response = await withTimeout(
            fetch(`${this.baseUrl}/capabilities`, {
              method: "GET",
              headers: this.headers,
            }),
            this.timeoutMs,
            () => new A2AError("REQUEST_TIMEOUT", "Discovery timed out."),
          );

          validateResponse(response);
          const payload = await response.json();
          const manifest = parseManifest(payload);

          this.cache.set(this.baseUrl, manifest);
          return manifest;
        })()
      : cached;
  }

  async requireCapability(name: string, version: string): Promise<Capability> {
    const manifest = await this.discover();
    return requireCapability(manifest, name, version);
  }

  clearCache(): void {
    this.cache.clear();
  }
}
