import { describe, expect, it } from 'vitest';
import { prependBundledGitPath } from './node';

describe('prependBundledGitPath', () => {
  it('prepends a bundled Git path containing spaces', () => {
    const env: NodeJS.ProcessEnv = { Path: 'C:\\Windows\\System32' };

    prependBundledGitPath({ env }, 'C:\\Program Files\\Choko\\git\\cmd');

    expect(env.Path).toBe('C:\\Program Files\\Choko\\git\\cmd;C:\\Windows\\System32');
  });

  it('does not add the same directory twice, regardless of case', () => {
    const env: NodeJS.ProcessEnv = { Path: 'C:\\Program Files\\Choko\\GIT\\CMD;C:\\Windows' };

    prependBundledGitPath({ env }, 'C:\\Program Files\\Choko\\git\\cmd');

    expect(env.Path).toBe('C:\\Program Files\\Choko\\GIT\\CMD;C:\\Windows');
  });

  it('does nothing when the runtime has no environment', () => {
    expect(() => prependBundledGitPath({}, 'C:\\Program Files\\Choko\\git\\cmd')).not.toThrow();
  });
});
