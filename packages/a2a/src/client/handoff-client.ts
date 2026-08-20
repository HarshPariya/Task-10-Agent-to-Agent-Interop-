import {
  PROTOCOL_VERSION,
  type CapabilityManifest,
} from "../protocol/capability.js";
import {
  type HandoffRequest,
  type HandoffResponse,
} from "../protocol/handoff.js";
import { A2AError } from "../protocol/errors.js";

export interface HandoffClientOptions {
  baseUrl: string;
  timeoutMs: number;
  headers?: Record<string, string>;
  maxRetries?: number;
}

export interface HandoffOptions {
  capability: string;
  capabilityVersion: string;
  task: string;
}

const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_RETRIES = 2;

export class HandoffClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly headers: Record<string, string>;
  private readonly maxRetries: number;

  constructor(options: HandoffClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.headers = { "Content-Type": "application/json", ...options.headers };
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  async getCapabilities(): Promise<CapabilityManifest> {
    return this.request("/capabilities", { method: "GET" }).then(
      (r) => r.json() as Promise<CapabilityManifest>,
    );
  }

  async handoff(options: HandoffOptions): Promise<HandoffResponse> {
    const request: HandoffRequest = {
      protocolVersion: PROTOCOL_VERSION,
      requestId: crypto.randomUUID(),
      capability: options.capability,
      capabilityVersion: options.capabilityVersion,
      task: options.task,
      timeoutMs: this.timeoutMs,
    };

    return this.requestWithRetry("/handoff", {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(request),
    });
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new A2AError("EXTERNAL_AGENT_ERROR", `HTTP ${response.status}.`);
      }

      return response;
    } catch (err) {
      if (err instanceof A2AError) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new A2AError(
          "EXTERNAL_AGENT_ERROR",
          `Request timed out after ${this.timeoutMs}ms.`,
          err,
        );
      }
      throw new A2AError("EXTERNAL_AGENT_ERROR", "Request failed.", err);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestWithRetry(
    path: string,
    init: RequestInit,
  ): Promise<HandoffResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.request(path, init);
        return response.json() as Promise<HandoffResponse>;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
        }
      }
    }

    throw new A2AError(
      "EXTERNAL_AGENT_ERROR",
      `Failed after ${this.maxRetries + 1} attempts.`,
      lastError,
    );
  }
}
