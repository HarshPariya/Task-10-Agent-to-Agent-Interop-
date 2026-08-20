import { z } from "zod";

export const PROTOCOL_VERSION = "a2a/v1" as const;

export const capabilitySchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.string().min(1),
  outputSchema: z.string().min(1),
});

export const capabilityManifestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  agentId: z.string().min(1),
  agentVersion: z.string().min(1),
  capabilities: z.array(capabilitySchema).min(1),
});

export function findCapability(
  manifest: {
    readonly capabilities: readonly z.infer<typeof capabilitySchema>[];
  },
  capabilityName: string,
  capabilityVersion: string,
): z.infer<typeof capabilitySchema> | undefined {
  return manifest.capabilities.find(
    (capability) =>
      capability.name === capabilityName &&
      capability.version === capabilityVersion,
  );
}
