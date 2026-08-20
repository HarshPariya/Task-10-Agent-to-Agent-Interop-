import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { PROTOCOL_VERSION } from "../protocol/capability.js";
import { handoffRequestSchema } from "../protocol/handoff.js";
import { A2AError } from "../protocol/errors.js";
import { A2A_ENDPOINTS } from "../config.js";
import type {
  CapabilityManifest,
  HandoffRequest,
  HandoffResponse,
  HandoffStatus,
} from "../types/index.js";

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

    return recent.length >= this.maxRequests
      ? false
      : (recent.push(now), this.requests.set(ip, recent), true);
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
    return this.server
      ? Promise.reject(
          new A2AError("EXTERNAL_AGENT_ERROR", "Server already running."),
        )
      : new Promise((resolve, reject) => {
          this.server = createServer(
            (req, res) => void this.handleRequest(req, res),
          );
          const server = this.server!;
          const onError = (err: Error) => {
            server.off("listening", onListening);
            reject(
              new A2AError(
                "EXTERNAL_AGENT_ERROR",
                "Failed to start server.",
                err,
              ),
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
    return this.server
      ? new Promise<void>((resolve) => {
          this.server!.close((err) => {
            this.server = undefined;
            resolve();
          });
        })
      : Promise.resolve();
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const ip = req.socket.remoteAddress ?? "unknown";
    this.rateLimiter.check(ip)
      ? (async () => {
          try {
            const routeKey = `${req.method ?? "UNKNOWN"} ${req.url ?? ""}`;
            const handler = this.routes.get(routeKey);

            handler
              ? await handler(req, res)
              : this.sendJson(res, 404, {
                  error: { code: "NOT_FOUND", message: "Route not found." },
                });
          } catch (err) {
            this.handleServerError(res, err);
          }
        })()
      : this.sendJson(res, 429, {
          error: { code: "RATE_LIMITED", message: "Too many requests." },
        });
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

    return validation.success
      ? this.sendJson(
          res,
          this.statusCode(await this.agent.handleHandoff(validation.data)),
          await this.agent.handleHandoff(validation.data),
        )
      : this.sendJson(res, 400, {
          protocolVersion: PROTOCOL_VERSION,
          requestId: "unknown",
          status: "rejected",
          error: {
            code: "INVALID_REQUEST",
            message: "Request does not match handoff contract.",
          },
        });
  }

  private statusCode(response: HandoffResponse): number {
    const CODES: Record<HandoffStatus, number> = {
      success: 200,
      rejected: 400,
      error: 500,
    };
    return CODES[response.status];
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

      const fail = (err: unknown) =>
        done ? undefined : ((done = true), reject(err));

      req.on("data", (chunk: Buffer) => {
        total += chunk.length;
        return total > this.maxBodyBytes
          ? (req.destroy(),
            fail(
              new A2AError(
                "INVALID_REQUEST",
                `Body exceeds ${this.maxBodyBytes}-byte limit.`,
              ),
            ))
          : chunks.push(chunk);
      });

      req.on("end", () => {
        return done
          ? undefined
          : ((done = true), resolve(Buffer.concat(chunks).toString("utf8")));
      });

      req.on("error", fail);
    });
  }

  private sendJson(
    res: ServerResponse,
    status: number,
    payload: unknown,
  ): void {
    res.headersSent
      ? undefined
      : (res.writeHead(status, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        }),
        res.end(JSON.stringify(payload)));
  }

  private handleServerError(res: ServerResponse, err: unknown): void {
    res.headersSent
      ? res.end()
      : this.sendJson(res, 500, {
          error: {
            code: (err instanceof A2AError
              ? err
              : new A2AError(
                  "EXTERNAL_AGENT_ERROR",
                  "Unexpected server error.",
                  err,
                )
            ).code,
            message: (err instanceof A2AError
              ? err
              : new A2AError(
                  "EXTERNAL_AGENT_ERROR",
                  "Unexpected server error.",
                  err,
                )
            ).message,
          },
        });
  }
}
