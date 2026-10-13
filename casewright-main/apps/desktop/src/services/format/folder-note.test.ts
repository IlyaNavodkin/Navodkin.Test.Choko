import { describe, expect, it } from 'vitest';
import { parseFolderNote, serializeFolderNote } from './folder-note';

describe('serializeFolderNote', () => {
  it('emits name + prefix front matter with the description as the body', () => {
    expect(serializeFolderNote({ name: 'Payments QA', prefix: 'PAY', description: 'Billing and payments.' })).toBe(
      '---\nname: Payments QA\ndisplayIdPrefix: PAY\n---\n\nBilling and payments.\n',
    );
  });

  it('omits a blank prefix and writes a body-less note when there is no description', () => {
    expect(serializeFolderNote({ name: 'Team Invites' })).toBe('---\nname: Team Invites\n---\n');
    expect(serializeFolderNote({ name: 'X', prefix: '   ', description: '  ' })).toBe('---\nname: X\n---\n');
  });
});

describe('parseFolderNote', () => {
  it('round-trips name/prefix/description', () => {
    const text = serializeFolderNote({ name: 'Sessions', prefix: 'SESS', description: 'Idle timeout.' });
    const { meta, description } = parseFolderNote(text);
    expect(meta.name).toBe('Sessions');
    expect(meta.displayIdPrefix).toBe('SESS');
    expect(description).toBe('Idle timeout.');
  });

  it('coerces missing fields to defaults (tolerant)', () => {
    const { meta, description } = parseFolderNote('---\n---\n\nJust a body.\n');
    expect(meta.name).toBe('');
    expect(meta.displayIdPrefix).toBe('');
    expect(description).toBe('Just a body.');
  });
});
