import { describe, expect, it, vi } from 'vitest';
import {
  createRuntimeDiagnosticsApi,
  RuntimeApiError,
} from '../src/desktop-platform/api/runtimeDiagnosticsApi';
import { createNativeInvoke, NativeInvokeError } from '../src/shared/infrastructure/tauri/nativeInvoke';
import {
  RuntimeDiagnosticsRequestSchema,
  RuntimeDiagnosticsSchema,
} from '../src/desktop-platform/api/contracts';

const validDiagnostics = {
  appVersion: '0.1.0',
  platform: 'windows',
  architecture: 'x86_64',
  nativeRuntime: true,
} as const;

describe('runtime diagnostics contracts', () => {
  it('rejects unsupported request versions and extra fields', () => {
    expect(RuntimeDiagnosticsRequestSchema.safeParse({ protocolVersion: 2 }).success).toBe(false);
    expect(
      RuntimeDiagnosticsRequestSchema.safeParse({ protocolVersion: 1, unexpected: true }).success,
    ).toBe(false);
  });

  it('rejects malformed native DTOs instead of trusting the Rust type declaration', () => {
    expect(RuntimeDiagnosticsSchema.safeParse({ ...validDiagnostics, architecture: 7 }).success).toBe(
      false,
    );
    expect(RuntimeDiagnosticsSchema.safeParse({ ...validDiagnostics, nativeRuntime: false }).success).toBe(
      false,
    );
  });

  it('reports unsupported native runtime without invoking a command', async () => {
    const invoke = vi.fn(async () => validDiagnostics);
    const nativeInvoke = createNativeInvoke({ isNativeRuntime: false, invoke });

    await expect(nativeInvoke('get_runtime_diagnostics')).rejects.toMatchObject({
      code: 'NATIVE_RUNTIME_UNAVAILABLE',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invokes the typed command with protocol version 1 and returns its validated DTO', async () => {
    const invoke = vi.fn(async () => validDiagnostics);
    const api = createRuntimeDiagnosticsApi({
      invoke: createNativeInvoke({ isNativeRuntime: true, invoke }),
    });

    await expect(api.get()).resolves.toEqual(validDiagnostics);
    expect(invoke).toHaveBeenCalledWith('get_runtime_diagnostics', {
      request: { protocolVersion: 1 },
    });
  });

  it('validates the native response and hides malformed native errors', async () => {
    const api = createRuntimeDiagnosticsApi({
      invoke: createNativeInvoke({
        isNativeRuntime: true,
        invoke: vi.fn(async () => ({ ...validDiagnostics, platform: 'unknown' })),
      }),
    });
    await expect(api.get()).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });

    const malformedInvoke = createNativeInvoke({
      isNativeRuntime: true,
      invoke: vi.fn(async () => Promise.reject({ code: 7, message: { secret: 'internal' } })),
    });
    await expect(malformedInvoke('get_runtime_diagnostics')).rejects.toMatchObject({
      code: 'NATIVE_COMMAND_FAILED',
    });
  });

  it('preserves a valid native error code without exposing its raw message', async () => {
    const nativeInvoke = createNativeInvoke({
      isNativeRuntime: true,
      invoke: vi.fn(async () =>
        Promise.reject({ code: 'UNAUTHORIZED_WEBVIEW', message: 'private native detail' }),
      ),
    });
    const api = createRuntimeDiagnosticsApi({ invoke: nativeInvoke });

    const error = await api.get().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RuntimeApiError);
    expect(error).toMatchObject({ code: 'UNAUTHORIZED_WEBVIEW' });
    expect((error as Error).message).not.toContain('private native detail');
    expect(new NativeInvokeError('UNAUTHORIZED_WEBVIEW').message).toBe('UNAUTHORIZED_WEBVIEW');
  });
});
