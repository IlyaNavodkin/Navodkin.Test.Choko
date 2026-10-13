import { describe, expect, it } from 'vitest';
import { ConfigYamlSchema, WorkspaceYamlSchema } from './index';

describe('ConfigYamlSchema', () => {
  it('defaults version to 1 and accepts an optional name', () => {
    expect(ConfigYamlSchema.parse({})).toMatchObject({ version: 1 });
    expect(ConfigYamlSchema.parse({ version: 2, name: 'QA' })).toMatchObject({ version: 2, name: 'QA' });
  });

  it('coerces a malformed version to the default instead of throwing', () => {
    expect(ConfigYamlSchema.parse({ version: 'nope' }).version).toBe(1);
  });

  it('preserves unknown keys (looseObject)', () => {
    expect(ConfigYamlSchema.parse({ version: 1, future: 'x' })).toMatchObject({ future: 'x' });
  });

  it('defaults workspaces to [] and accepts a list (+ root metadata fields)', () => {
    expect(ConfigYamlSchema.parse({}).workspaces).toEqual([]);
    const p = ConfigYamlSchema.parse({ workspaces: ['areas/payments', '.'], displayIdPrefix: 'RT', description: 'root' });
    expect(p.workspaces).toEqual(['areas/payments', '.']);
    expect(p.displayIdPrefix).toBe('RT');
    expect(p.description).toBe('root');
  });

  it('coerces a malformed workspaces value to [] instead of throwing', () => {
    expect(ConfigYamlSchema.parse({ workspaces: 'nope' }).workspaces).toEqual([]);
  });
});

describe('WorkspaceYamlSchema', () => {
  it('defaults blank name/displayIdPrefix (the service coerces + warns)', () => {
    const p = WorkspaceYamlSchema.parse({});
    expect(p.name).toBe('');
    expect(p.displayIdPrefix).toBe('');
  });

  it('coerces non-string scalars rather than throwing', () => {
    const p = WorkspaceYamlSchema.parse({ name: 123, displayIdPrefix: 7 });
    expect(p.name).toBe('123');
    expect(p.displayIdPrefix).toBe('7');
  });

  it('keeps description optional and carries no runsDir', () => {
    const p = WorkspaceYamlSchema.parse({ name: 'X', displayIdPrefix: 'X' });
    expect(p.description).toBeUndefined();
    expect('runsDir' in p).toBe(false);
  });
});
