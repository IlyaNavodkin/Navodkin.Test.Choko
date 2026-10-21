import { describe, expect, it } from 'vitest';
import { GitUnavailableError, systemGitVersion } from './node';

describe('system Git', () => {
  it('finds Git installed on the OS', () => {
    expect(systemGitVersion()).toMatch(/^git version \d+\./);
  });

  it('uses an actionable installation message when Git is unavailable', () => {
    expect(new GitUnavailableError().message).toContain('Установите Git');
    expect(new GitUnavailableError().message).toContain('git --version');
  });
});
