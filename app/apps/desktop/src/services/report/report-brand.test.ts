import { describe, expect, it } from 'vitest';
import brandTokens from '@choko/brand/tokens.css?raw';
import { REPORT_STYLE, renderToolbar } from './report-shared';

describe('Choko report brand', () => {
  it('shares the application colors and typography without CSS imports', () => {
    expect(REPORT_STYLE).toContain(brandTokens.replace(/@import[^;]+;/g, ''));
    expect(REPORT_STYLE).toContain('--accent: #900c30');
    expect(REPORT_STYLE).not.toContain('@import');
    expect(REPORT_STYLE).not.toContain('0.55 0.13 283');
  });
  it('embeds local Russian and English font binaries in standalone reports', () => {
    expect(REPORT_STYLE).toContain('font-family: \'Onest\'');
    expect(REPORT_STYLE).toContain('font-family: \'Rubik\'');
    expect(REPORT_STYLE).toContain('data:font/woff2;base64,');
    expect(REPORT_STYLE).not.toContain('url(./fonts/');
  });
  it('brands the PDF preview toolbar', () => {
    expect(renderToolbar()).toContain('Choko · Report preview');
  });
});
