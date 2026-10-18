import { describe, expect, it } from 'vitest';
import { serializeWorkspaceYaml } from './workspace';

describe('serializeWorkspaceYaml', () => {
  it('emits name, optional description, and displayIdPrefix — never runsDir', () => {
    const out = serializeWorkspaceYaml({ name: 'Payments QA', description: 'Billing area.', prefix: 'PAY' });
    expect(out).toBe('name: Payments QA\ndescription: Billing area.\ndisplayIdPrefix: PAY\n');
    expect(out).not.toMatch(/runsDir/);
  });

  it('omits a blank description', () => {
    expect(serializeWorkspaceYaml({ name: 'X', description: '   ', prefix: 'X' })).toBe('name: X\ndisplayIdPrefix: X\n');
  });
});
