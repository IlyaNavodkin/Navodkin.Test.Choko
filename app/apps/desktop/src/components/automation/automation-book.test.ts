import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '@/schemas/automation-store';
import { AutomationCard, AutomationListView } from './AutomationBook';
import { cases } from '@/data/sample';

const entry = (over: Partial<CatalogEntry> = {}): CatalogEntry => ({
  automationId: 'login',
  caseId: 'RND-0001',
  variantId: null,
  project: 'chromium',
  title: 'login works',
  titlePath: ['login.spec.ts', 'login works'],
  file: 'tests/login.spec.ts',
  line: 3,
  tags: ['@tt:login'],
  expectedStatus: 'passed',
  arguments: [],
  archived: false,
  revision: 'r1',
  ...over,
});

const decode = (html: string): string =>
  html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const noop = () => {};

describe('AutomationListView', () => {
  const render = (over: Partial<Parameters<typeof AutomationListView>[0]> = {}) =>
    decode(
      renderToStaticMarkup(
        createElement(AutomationListView, {
          entries: [entry(), entry({ automationId: 'logout', title: 'logout works', archived: true })],
          selectedId: null,
          query: '',
          filter: 'all',
          project: '',
          onSelect: noop,
          onQuery: noop,
          onFilter: noop,
          onProject: noop,
          ...over,
        }),
      ),
    );

  it('shows runnable entries and hides archived by default', () => {
    const html = render();
    expect(html).toContain('login works');
    expect(html).not.toContain('logout works');
    expect(html).toContain('Archive (1)');
  });

  it('shows archived entries with the archive filter', () => {
    expect(render({ filter: 'archived' })).toContain('logout works');
  });

  it('filters by query and reports no matches', () => {
    expect(render({ query: 'zzz' })).toContain('Nothing matches');
    expect(render({ query: 'RND-0001' })).toContain('login works');
  });
});

describe('AutomationCard', () => {
  const render = (over: Partial<Parameters<typeof AutomationCard>[0]> = {}) =>
    decode(
      renderToStaticMarkup(
        createElement(AutomationCard, {
          entry: entry(),
          bindings: [],
          cases,
          docs: [],
          onArchive: noop,
          onCase: noop,
          onArgumentSet: noop,
          onOpenReference: noop,
          ...over,
        }),
      ),
    );

  it('renders identity, the tag and the no-arguments state', () => {
    const html = render();
    expect(html).toContain('login works');
    expect(html).toContain('login');
    expect(html).toContain('chromium');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('Argument set');
    expect(html).toContain('Not linked to a case');
    expect(html).toContain('Reference book');
    expect(html).not.toContain('Bind to open case');
  });

  it('renders a direct Case selector independent of the open editor', () => {
    const html = render({
      entry: entry({ arguments: [{ key: 'baseUrl', type: 'url', required: true }] }),
      bindings: [{ id: 'b1', caseId: cases[0].id, automationId: 'login', project: 'chromium', variantId: 'default', enabled: true, archived: false, arguments: {} }],
    });
    expect(html).toContain('aria-label="Test case"');
    expect(html).toContain('aria-label="Argument set"');
    expect(html).toContain(cases[0].displayId);
    expect(html).not.toContain('Save arguments');
  });

  it('shows an empty-selection placeholder', () => {
    expect(render({ entry: null })).toContain('Select an autotest');
  });
});
