import { z } from 'zod';

export const RuntimeDiagnosticsRequestSchema = z
  .object({ protocolVersion: z.literal(1) })
  .strict();

export const RuntimeDiagnosticsSchema = z
  .object({
    appVersion: z.string().min(1).max(32),
    platform: z.enum(['windows', 'macos', 'linux', 'other']),
    architecture: z.enum(['x86_64', 'aarch64', 'arm64', 'x86', 'other']),
    nativeRuntime: z.literal(true),
  })
  .strict();

export type RuntimeDiagnosticsRequest = z.infer<typeof RuntimeDiagnosticsRequestSchema>;
export type RuntimeDiagnostics = z.infer<typeof RuntimeDiagnosticsSchema>;
