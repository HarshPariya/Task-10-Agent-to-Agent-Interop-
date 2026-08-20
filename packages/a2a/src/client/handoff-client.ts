import { PROTOCOL_VERSION } from "../protocol/capability.js";
import { A2AError } from "../protocol/errors.js";
import type {
  CapabilityManifest,
  HandoffRequest,
  HandoffResponse,
  HandoffClientOptions,
  HandoffOptions,
} from "../types/client.js";

const DEFAULT_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_RETRIES = 2;

type ErrorClassifier = (err: unknown) => A2AError | null;

const CLASSIFIERS: readonly ErrorClassifier[] = [
  (err) => (err instanceof A2AError ? err : null),
  (err) =>
    err instanceof DOMException && err.name === "AbortError"
      ? new A2AError("REQUEST_TIMEOUT", "Request timed out.")
      : null,
];

const classifyError = (err: unknown): A2AError =>
  CLASSIFIERS.reduce((acc, c) => acc ?? c(err), null as A2AError | null) ??
  new A2AError("EXTERNAL_AGENT_ERROR", "Request failed.", err);

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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
    const { response } = await this.request("/capabilities", { method: "GET" });
    return response.json() as Promise<CapabilityManifest>;
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

  private async request(
    path: string,
    init: RequestInit,
  ): Promise<{ response: Response; isAgentError: boolean }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });

      const isAgentError =
        response.status === 500 &&
        init.method === "POST" &&
        path === "/handoff";

      const errorBody =
        response.ok || isAgentError
          ? undefined
          : await this.parseErrorBody(response);

      return response.ok || isAgentError
        ? { response, isAgentError }
        : (() => {
            throw new A2AError(
              "EXTERNAL_AGENT_ERROR",
              `HTTP ${response.status}`,
              errorBody,
            );
          })();
    } catch (err) {
      throw classifyError(err);
    } finally {
      clearTimeout(timer);
    }
  }

  private async parseErrorBody(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  private async requestWithRetry(
    path: string,
    init: RequestInit,
  ): Promise<HandoffResponse> {
    const attempts = this.maxRetries + 1;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const { response } = await this.request(path, init);
        return (await response.json()) as HandoffResponse;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await delay(100 * (attempt + 1));
      }
    }

    throw new A2AError(
      "EXTERNAL_AGENT_ERROR",
      `Failed after ${attempts} attempts.`,
      lastError,
    );
  }
}
