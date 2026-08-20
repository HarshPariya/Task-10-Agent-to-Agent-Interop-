import type {
  Capability,
  CapabilityManifest,
  HandoffRequest,
  HandoffResponse,
  HandoffStatus,
} from "./core.js";

export interface ExternalAgent {
  getCapabilities(): CapabilityManifest;
  handleHandoff(request: HandoffRequest): Promise<HandoffResponse>;
}

export interface ExternalAgentServerOptions {
  readonly host?: string;
  readonly port: number;
  readonly maxBodyBytes?: number;
  readonly rateLimit?: { readonly requests: number; readonly windowMs: number };
}

export type RouteHandler = (
  request: {
    readonly method?: string;
    readonly url?: string;
    readonly socket: { readonly remoteAddress?: string };
  },
  response: {
    writeHead(status: number, headers: Record<string, string>): void;
    end(body: string): void;
    readonly headersSent: boolean;
  },
) => Promise<void>;
