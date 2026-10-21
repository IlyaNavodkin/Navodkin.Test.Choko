import { describe, expect, it } from 'vitest';
import { MINGIT, verifyGitArchive } from './bundle-git.mjs';

describe('bundled Git integrity', () => {
  it('rejects a modified or incomplete download before extraction', () => {
    expect(() => verifyGitArchive(Buffer.from('incomplete archive'))).toThrow('checksum mismatch');
  });
  it('pins the official release and a complete SHA-256 digest', () => {
    expect(new URL(MINGIT.url).hostname).toBe('github.com');
    expect(MINGIT.url).toContain('/git-for-windows/git/releases/download/');
    expect(MINGIT.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
