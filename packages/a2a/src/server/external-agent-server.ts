import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { PROTOCOL_VERSION } from "../protocol/capability.js";
import { type CapabilityManifest } from "../protocol/capability.js";
import {
  handoffRequestSchema,
  type HandoffRequest,
  type HandoffResponse,
} from "../protocol/handoff.js";
import { A2AError } from "../protocol/errors.js";
import { A2A_ENDPOINTS } from "../config.js";

export interface ExternalAgent {
  getCapabilities(): CapabilityManifest;
  handleHandoff(request: HandoffRequest): Promise<HandoffResponse>;
}

export interface ExternalAgentServerOptions {
  host?: string;
  port: number;
  maxBodyBytes?: number;
  rateLimit?: { requests: number; windowMs: number };
}

type RouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const DEFAULT_RATE_LIMIT = { requests: 100, windowMs: 60_000 };

class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly requests = new Map<string, number[]>();

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(ip: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = this.requests.get(ip) ?? [];
    const recent = timestamps.filter((t) => t > windowStart);

    if (recent.length >= this.maxRequests) return false;

    recent.push(now);
    this.requests.set(ip, recent);
    return true;
  }
}

export class ExternalAgentServer {
  private readonly host: string;
  private readonly port: number;
  private readonly maxBodyBytes: number;
  private readonly rateLimiter: RateLimiter;
  private readonly agent: ExternalAgent;
  private readonly routes: Map<string, RouteHandler>;
  private server: Server | undefined;

  constructor(agent: ExternalAgent, options: ExternalAgentServerOptions) {
    this.agent = agent;
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port;
    this.maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    const rl = options.rateLimit ?? DEFAULT_RATE_LIMIT;
    this.rateLimiter = new RateLimiter(rl.requests, rl.windowMs);

    this.routes = new Map([
      [`GET ${A2A_ENDPOINTS.health}`, this.handleHealth.bind(this)],
      [`GET ${A2A_ENDPOINTS.capabilities}`, this.handleCapabilities.bind(this)],
      [`POST ${A2A_ENDPOINTS.handoff}`, this.handleHandoff.bind(this)],
    ]);
  }

  start(): Promise<void> {
    if (this.server) {
      return Promise.reject(
        new A2AError("EXTERNAL_AGENT_ERROR", "Server already running."),
      );
    }

    this.server = createServer((req, res) => void this.handleRequest(req, res));

    return new Promise((resolve, reject) => {
      const server = this.server!;
      const onError = (err: Error) => {
        server.off("listening", onListening);
        reject(
          new A2AError("EXTERNAL_AGENT_ERROR", "Failed to start server.", err),
        );
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.port, this.host);
    });
  }

  stop(): Promise<void> {
    const server = this.server;
    if (!server) return Promise.resolve();

    return new Promise((resolve, reject) => {
      server.close((err) => {
        if (err)
          reject(
            new A2AError("EXTERNAL_AGENT_ERROR", "Failed to stop server.", err),
          );
        else {
          this.server = undefined;
          resolve();
        }
      });
    });
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const ip = req.socket.remoteAddress ?? "unknown";
    if (!this.rateLimiter.check(ip)) {
      this.sendJson(res, 429, {
        error: { code: "RATE_LIMITED", message: "Too many requests." },
      });
      return;
    }

    try {
      const routeKey = `${req.method ?? "UNKNOWN"} ${req.url ?? ""}`;
      const handler = this.routes.get(routeKey);

      if (!handler) {
        this.sendJson(res, 404, {
          error: { code: "NOT_FOUND", message: "Route not found." },
        });
        return;
      }

      await handler(req, res);
    } catch (err) {
      this.handleServerError(res, err);
    }
  }

  private async handleHealth(
    _req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    this.sendJson(res, 200, { status: "ok" });
  }

  private async handleCapabilities(
    _req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    this.sendJson(res, 200, this.agent.getCapabilities());
  }

  private async handleHandoff(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await this.readBody(req);
    const parsed = this.parseJson(body);
    const validation = handoffRequestSchema.safeParse(parsed);

    if (!validation.success) {
      this.sendJson(res, 400, {
        protocolVersion: PROTOCOL_VERSION,
        requestId: "unknown",
        status: "rejected",
        error: {
          code: "INVALID_REQUEST",
          message: "Request does not match handoff contract.",
        },
      });
      return;
    }

    const result = await this.agent.handleHandoff(validation.data);
    this.sendJson(res, this.statusCode(result), result);
  }

  private parseJson(body: string): unknown {
    try {
      return JSON.parse(body);
    } catch (err) {
      throw new A2AError(
        "INVALID_REQUEST",
        "Invalid JSON in request body.",
        err,
      );
    }
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let done = false;

      const fail = (err: unknown) => {
        if (done) return;
        done = true;
        reject(err);
      };

      req.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > this.maxBodyBytes) {
          req.destroy();
          fail(
            new A2AError(
              "INVALID_REQUEST",
              `Body exceeds ${this.maxBodyBytes}-byte limit.`,
            ),
          );
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        if (done) return;
        done = true;
        resolve(Buffer.concat(chunks).toString("utf8"));
      });

      req.on("error", fail);
    });
  }

  private statusCode(response: HandoffResponse): number {
    return { success: 200, rejected: 400, error: 500 }[response.status];
  }

  private sendJson(
    res: ServerResponse,
    status: number,
    payload: unknown,
  ): void {
    if (res.headersSent) return;
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(payload));
  }

  private handleServerError(res: ServerResponse, err: unknown): void {
    if (res.headersSent) {
      res.end();
      return;
    }

    const a2aErr =
      err instanceof A2AError
        ? err
        : new A2AError("EXTERNAL_AGENT_ERROR", "Unexpected server error.", err);
    this.sendJson(res, 500, {
      error: { code: a2aErr.code, message: a2aErr.message },
    });
  }
}
