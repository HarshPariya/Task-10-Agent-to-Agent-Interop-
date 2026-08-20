import { z } from "zod";
import { PROTOCOL_VERSION } from "./capability.js";

export const handoffRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().min(1),
  capability: z.string().min(1),
  capabilityVersion: z.string().min(1),
  task: z.string().min(1),
  timeoutMs: z.number().int().positive(),
});

export const handoffResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().min(1),
  status: z.enum(["success", "rejected", "error"]),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
});
