import test from 'node:test';
import assert from 'node:assert/strict';
import { ManifestSchema, ReportSchema, outcomeOf, parseImport, previewImport, LIMITS } from '../dist/index.mjs';
import { ReportV2Schema } from '../dist/runner-contracts.mjs';
import { manifest, report, key, attempt } from './fixtures.mjs';
import { readFile } from 'node:fs/promises';

test('strict manifest identity, versions, paths and selection', () => {
  assert.ok(ManifestSchema.safeParse(manifest()).success);
  for (const change of [{ schemaVersion: 2 }, { extra: true }, { runId: '../run' }, { runId:'run\u0000bad' }, { executionId: 'x' }, { selection: [key, key] }]) {
    assert.equal(ManifestSchema.safeParse({ ...manifest(), ...change }).success, false);
  }
});
test('Playwright JSON rows remain unmatched without metadata, duplicates are blocked, explicit mapping allowed', () => {
  const raw = {suites:[{specs:[{title:'one',file:'test.spec.ts',tests:[{projectName:'unit',expectedStatus:'passed',results:[{retry:0,status:'passed',duration:1,startTime:'2026-10-16T00:00:00.000Z'}]}]}]}]};
  const parsed = parseImport(JSON.stringify(raw),'playwright');
  const options = {targetRunId:'runs/example',targetRevision:'a'.repeat(64),sourceHash:'b'.repeat(64),bindings:[key],importedHashes:[]};
  assert.equal(previewImport(parsed,options).rows[0].status,'unmatched');
  assert.equal(previewImport(parsed,{...options,mapping:{0:key}}).rows[0].status,'matched');
  assert.equal(previewImport({...parsed,tests:[{...parsed.tests[0],identity:key},{...parsed.tests[0],identity:key}]},options).rows[0].status,'duplicate');
  assert.throws(()=>parseImport('{bad','testoritto'));
  assert.throws(()=>parseImport(JSON.stringify({...report(),complete:false}),'testoritto'));
});
test('frontend bundle has no Node or external imports', async () => {
  const meta = JSON.parse(await readFile(new URL('../dist/index.meta.json',import.meta.url),'utf8'));
  for (const output of Object.values(meta.outputs)) assert.deepEqual(output.imports,[]);
  assert.ok(!Object.keys(meta.inputs).some(p=>p.includes('node-common')||p.includes('reporter')||p.includes('bridge')));
});
test('correlation, attempts and expected failure semantics', () => {
  assert.ok(ReportSchema.safeParse(report()).success);
  assert.equal(outcomeOf('failed', [attempt('failed')]), 'expected');
  assert.equal(outcomeOf('passed', [attempt('failed'), { ...attempt('passed'), retry: 1 }]), 'flaky');
  assert.equal(outcomeOf('passed', [attempt('skipped')]), 'skipped');
  assert.equal(outcomeOf('failed', [attempt('passed')]), 'unexpected');
  assert.equal(ReportSchema.safeParse({ ...report(), tests: [{ ...report().tests[0], outcome: 'flaky' }] }).success, false);
});
test('passive imports, explicit mappings and idempotency', () => {
  const parsed = parseImport(JSON.stringify(report()), 'testoritto');
  const preview = previewImport(parsed, { targetRunId: 'runs/other', targetRevision: 'a'.repeat(64), sourceHash: 'b'.repeat(64), bindings: [key], importedHashes: [] });
  assert.equal(preview.foreignRun, true);
  assert.equal(preview.rows[0].status, 'matched');
  assert.equal(previewImport(parsed, { ...preview, bindings: [key], importedHashes: ['b'.repeat(64)] }).duplicateImport, true);
});
test('JUnit strict XML without DTD, custom entities, malformed or oversized input', () => {
  for (const xml of ['<!DOCTYPE testsuite><testsuite/>', '<testsuite><testcase></testsuite>', '<testsuite>&secret;</testsuite>', '<testsuite a="1" a="2"/>']) assert.throws(() => parseImport(xml, 'junit'));
  assert.throws(() => parseImport(' '.repeat(LIMITS.reportBytes + 1), 'junit'));
  const xml = '<testsuite><testcase name="generic" time="0.2"/><testcase name="mapped"><properties><property name="testoritto.caseId" value="C1"/><property name="testoritto.automationId" value="A1"/><property name="testoritto.project" value="unit"/></properties><failure message="bad &amp; worse"/></testcase></testsuite>';
  const parsed = parseImport(xml, 'junit');
  assert.equal(parsed.runId, null);
  assert.equal(parsed.tests[0].identity, null);
  assert.equal(parsed.tests[1].identity.variantId, 'default');
  assert.equal(parsed.tests[1].attempts[0].status, 'failed');
});

test('version 2 runner fixtures stay valid for both sides of the boundary', async () => {
  const report = ReportV2Schema.parse(JSON.parse(await readFile(new URL('../fixtures/report-v2.json', import.meta.url), 'utf8')));
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.state, 'completed');
  assert.equal(report.tests.length, 3);
  assert.equal(new Set(report.tests.map(t => t.invocationId)).size, 3);
  assert.match(await readFile(new URL('../fixtures/report-v2.junit.xml', import.meta.url), 'utf8'), /testoritto.invocationId/);
});
