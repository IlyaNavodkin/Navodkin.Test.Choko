import { describe, expect, it } from 'vitest';
import { CASEWRIGHT_GITIGNORE, serializeConfigYaml } from './config';

describe('serializeConfigYaml', () => {
  it('emits version and an optional name', () => {
    expect(serializeConfigYaml({ version: 1, name: 'QA' })).toBe('version: 1\nname: QA\n');
    expect(serializeConfigYaml({ version: 2 })).toBe('version: 2\n');
  });

  it('omits a blank name', () => {
    expect(serializeConfigYaml({ version: 1, name: '   ' })).toBe('version: 1\n');
  });

  it('emits a workspaces block (and omits it when empty)', () => {
    expect(serializeConfigYaml({ version: 1, name: 'QA', workspaces: ['areas/payments', 'areas/onboarding'] })).toBe(
      'version: 1\nname: QA\nworkspaces:\n  - areas/payments\n  - areas/onboarding\n',
    );
    expect(serializeConfigYaml({ version: 1, workspaces: [] })).toBe('version: 1\n');
  });

  it('emits root-workspace metadata (displayIdPrefix + description) when present', () => {
    expect(serializeConfigYaml({ version: 1, name: 'Root', displayIdPrefix: 'RT', description: 'the root', workspaces: ['.'] })).toBe(
      'version: 1\nname: Root\ndisplayIdPrefix: RT\ndescription: the root\nworkspaces:\n  - .\n',
    );
  });
});

describe('CASEWRIGHT_GITIGNORE', () => {
  it('ignores cache/', () => {
    expect(CASEWRIGHT_GITIGNORE).toMatch(/^cache\/$/m);
  });
});
