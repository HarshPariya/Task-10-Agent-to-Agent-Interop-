import {
  capabilityManifestSchema,
  findCapability,
  type Capability,
  type CapabilityManifest,
} from "../protocol/capability.js";
import { A2AError } from "../protocol/errors.js";

export interface CapabilityClientOptions {
  baseUrl: string;
  timeoutMs: number;
  headers?: Record<string, string>;
}

export class CapabilityClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;
  private readonly cache = new Map<string, CapabilityManifest>();

  constructor(options: CapabilityClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.headers = { Accept: "application/json", ...options.headers };
  }

  async discover(force = false): Promise<CapabilityManifest> {
    if (!force && this.cache.has(this.baseUrl)) {
      return this.cache.get(this.baseUrl)!;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/capabilities`, {
        method: "GET",
        headers: this.headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new A2AError(
          "CAPABILITY_DISCOVERY_FAILED",
          `Discovery failed: HTTP ${response.status}.`,
        );
      }

      const payload = await response.json();
      const result = capabilityManifestSchema.safeParse(payload);

      if (!result.success) {
        throw new A2AError(
          "INVALID_CAPABILITY_MANIFEST",
          "Invalid capability manifest.",
          result.error,
        );
      }

      this.cache.set(this.baseUrl, result.data);
      return result.data;
    } catch (err) {
      if (err instanceof A2AError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new A2AError(
          "REQUEST_TIMEOUT",
          `Discovery timed out after ${this.timeoutMs}ms.`,
        );
      }
      throw new A2AError(
        "CAPABILITY_DISCOVERY_FAILED",
        "Unable to discover capabilities.",
        err,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async requireCapability(name: string, version: string): Promise<Capability> {
    const manifest = await this.discover();
    const capability = findCapability(manifest, name, version);

    if (!capability) {
      throw new A2AError(
        "CAPABILITY_NOT_SUPPORTED",
        `Capability "${name}@${version}" not supported.`,
      );
    }

    return capability;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
