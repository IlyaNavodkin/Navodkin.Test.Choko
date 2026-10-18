import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, symlink, stat } from 'node:fs/promises';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invocationV2, manifest as example, manifestV2 } from './fixtures.mjs';
import { parseImport, parseReport, LIMITS } from '../dist/index.mjs';
import { readFinalReport, validateExit } from '../dist/bridge.mjs';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const cache = path.resolve(packageRoot, '../../.cache');
const bridge = path.join(packageRoot, 'dist/bridge.mjs');
async function fixture(source, configExtra = '') {
  await mkdir(cache, { recursive: true });
  const cwd = await mkdtemp(path.join(cache, 'playwright-automation-'));
  await symlink(path.join(packageRoot, 'node_modules'), path.join(cwd, 'node_modules'), 'junction');
  await writeFile(path.join(cwd, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(cwd, 'playwright.config.mjs'), `export default { testDir: '.', testMatch: 'case.spec.mjs', projects: [{ name: 'unit' }], timeout: 5000, ${configExtra} };`);
  await writeFile(path.join(cwd, 'case.spec.mjs'), `import { test, expect } from '@playwright/test'; import { writeFileSync, appendFileSync } from 'node:fs';
const details = (id, variant='default') => ({ annotation: [{type:'testoritto.caseId',description:'C-'+id},{type:'testoritto.automationId',description:id},{type:'testoritto.variantId',description:variant}] });
${source}`);
  return cwd;
}
async function call(cwd, operation, overrides = {}, gate) {
  const outputRoot = path.join(cwd, randomUUID()); await mkdir(outputRoot);
  const manifest = { ...example(), operation, executionId: randomUUID(), outputRoot, ...overrides };
  if (operation === 'discover') { manifest.selection = []; manifest.catalogRevision = null; }
  const manifestPath = path.join(outputRoot, 'manifest.json'); await writeFile(manifestPath, JSON.stringify(manifest));
  const child = spawn(process.execPath, [bridge, operation, manifestPath, ...(gate === undefined ? [] : ['--await-start'])], { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', c => { stdout += c; }); child.stderr.on('data', c => { stderr += c; });
  if (gate !== undefined) child.stdin.end(gate);
  const exit = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(stderr, '');
  const result = JSON.parse(stdout.trim());
  return { result, exit, manifest, outputRoot, read: async name => JSON.parse(await readFile(path.join(outputRoot, name), 'utf8')) };
}
async function callV2(cwd, operation, invocations, catalogRevision) {
  const outputRoot = path.join(cwd, randomUUID()); await mkdir(outputRoot);
  const manifest = manifestV2(invocations, catalogRevision);
  manifest.operation = operation;
  manifest.outputRoot = outputRoot;
  const manifestPath = path.join(outputRoot, 'manifest.json'); await writeFile(manifestPath, JSON.stringify(manifest));
  const child = spawn(process.execPath, [bridge, operation, manifestPath], { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', c => { stdout += c; }); child.stderr.on('data', c => { stderr += c; });
  const exit = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(stderr, '');
  return { result: JSON.parse(stdout.trim()), exit, outputRoot, read: name => JSON.parse(fs.readFileSync(path.join(outputRoot, name), 'utf8')) };
}
async function discoverV2(cwd) {
  const result = await callV2(cwd, 'discover', [], null);
  const events = fs.existsSync(path.join(result.outputRoot, 'events.ndjson')) ? fs.readFileSync(path.join(result.outputRoot, 'events.ndjson'), 'utf8').slice(0, 800) : 'no events';
  assert.equal(result.result.ok, true, JSON.stringify(result.result) + ' events=' + events + ' files=' + JSON.stringify(fs.readdirSync(result.outputRoot)));
  return result.read('catalog.json');
}
async function discover(cwd) { const result = await call(cwd, 'discover'); assert.equal(result.result.ok, true, JSON.stringify(result.result)); return result.read('catalog.json'); }
const selection = catalog => catalog.tests.map(({ caseId, automationId, project, variantId }) => ({ caseId, automationId, project, variantId }));

test('real Playwright discovery and exact variants exclude neighboring side effect', async () => {
  const cwd = await fixture(`test('same title', details('one','selected'), async()=>expect(1).toBe(1));
test('neighbor', details('one','neighbor'), async()=>writeFileSync('UNRELATED-RAN','bad'));`);
  const catalog = await discover(cwd);
  assert.equal(catalog.tests.length, 2);
  const run = await call(cwd, 'run', { catalogRevision: catalog.catalogRevision, selection: selection(catalog).filter(k => k.variantId === 'selected') });
  assert.equal(run.result.ok, true, JSON.stringify(run.result));
  const report = parseReport(await run.read('report.json'), run.manifest);
  assert.equal(report.tests.length, 1);
  await assert.rejects(stat(path.join(cwd, 'UNRELATED-RAN')));
  assert.match(await readFile(path.join(run.outputRoot, 'events.ndjson'), 'utf8'), /test_end/);
});
test('real pass/fail/expected fail/skip/flaky logs and copied attachment', async () => {
  const cwd = await fixture(`
test('pass',details('pass'),async({},info)=>{console.log('hello stdout'); console.error('hello stderr'); await info.attach('note',{body:Buffer.from('artifact'),contentType:'text/plain'});});
test('fail',details('fail'),async()=>expect(1).toBe(2));
test('expected failure',details('expected'),async()=>{test.fail();expect(1).toBe(2);});
test.skip('skipped',details('skip'),async()=>{});
test('flaky',details('flaky'),async({},info)=>expect(info.retry).toBe(1));`);
  const catalog = await discover(cwd);
  const run = await call(cwd, 'run', { catalogRevision: catalog.catalogRevision, selection: selection(catalog) });
  assert.equal(run.result.ok, true, JSON.stringify(run.result)); assert.equal(run.result.exitCode, 1);
  const report = parseReport(await run.read('report.json'), run.manifest), byId = new Map(report.tests.map(t => [t.automationId, t]));
  assert.equal(byId.get('pass').outcome, 'expected'); assert.equal(byId.get('fail').outcome, 'unexpected');
  assert.equal(byId.get('expected').outcome, 'expected'); assert.equal(byId.get('expected').expectedStatus, 'failed');
  assert.equal(byId.get('skip').outcome, 'skipped'); assert.equal(byId.get('flaky').outcome, 'flaky');
  assert.deepEqual(byId.get('flaky').attempts.map(a => [a.retry,a.status]), [[0,'failed'],[1,'passed']]);
  assert.match(byId.get('pass').attempts[0].stdout, /hello stdout/); assert.match(byId.get('pass').attempts[0].stderr, /hello stderr/);
  const attachment = report.attachments[0]; assert.equal(await readFile(path.join(run.outputRoot, attachment.path), 'utf8'), 'artifact');
  assert.equal(parseImport(JSON.stringify(report), 'testoritto').tests.length, 5);
  assert.throws(() => validateExit(report, 0));
});
test('stale/duplicate/missing identities never execute bodies', async () => {
  const cwd = await fixture(`test('one',details('one'),async()=>writeFileSync('RAN','bad'));`);
  const catalog = await discover(cwd);
  await writeFile(path.join(cwd,'case.spec.mjs'), (await readFile(path.join(cwd,'case.spec.mjs'),'utf8'))+'\n// changed source');
  const stale = await call(cwd, 'run', { catalogRevision: catalog.catalogRevision, selection: selection(catalog) });
  assert.equal(stale.result.ok, false); assert.match((await stale.read('report.json')).reason, /STALE_CATALOG/);
  await assert.rejects(stat(path.join(cwd,'RAN')));
  for (const source of [`test('one',details('same'),async()=>writeFileSync('RAN','bad')); test('two',details('same'),async()=>writeFileSync('RAN','bad'));`, `test('one',async()=>writeFileSync('RAN','bad'));`]) {
    const badCwd = await fixture(source); const bad = await call(badCwd, 'discover'); assert.equal(bad.result.ok, false); await assert.rejects(stat(path.join(badCwd,'RAN')));
  }
});
test('config failure, setup error and missing report are runner errors', async () => {
  const cwd = await fixture(`test('one',details('one'),async()=>{});`);
  const catalog = await discover(cwd);
  await writeFile(path.join(cwd,'setup.mjs'), 'export default () => { throw new Error("fixture setup failure"); };');
  for (const config of ['throw new Error("fixture config failure")', 'process.exit(0)', 'process.exit(7)', `export default {testMatch:'case.spec.mjs',projects:[{name:'unit'}],globalSetup:'./setup.mjs'}`]) {
    await writeFile(path.join(cwd,'playwright.config.mjs'), config);
    const run = await call(cwd, 'run', { catalogRevision: catalog.catalogRevision, selection: selection(catalog) });
    assert.equal(run.result.ok, false); assert.equal((await run.read('report.json')).state, 'runner_error');
  }
});
test('dependency projects rejected and start gate rejects EOF/wrong token before config', async () => {
  const cwd = await fixture(`test('one',details('one'),async()=>{});`, `projects:[{name:'unit',dependencies:['setup']},{name:'setup'}]`);
  assert.equal((await call(cwd,'discover')).result.ok, false);
  await writeFile(path.join(cwd,'playwright.config.mjs'), `import {writeFileSync} from 'node:fs'; writeFileSync('CONFIG-RAN','bad'); export default {};`);
  for (const token of ['', 'GO\n']) { const result = await call(cwd, 'discover', {}, token); assert.equal(result.result.ok, false); await assert.rejects(stat(path.join(cwd,'CONFIG-RAN'))); }
});
test('valid start token, repeatEach attempts and exact project', async () => {
  const cwd = await fixture(`test('one',details('one'),async()=>{});`, `repeatEach:2, projects:[{name:'unit'},{name:'other'}]`);
  const discovery = await call(cwd,'discover',{},'START\n'); assert.equal(discovery.result.ok,true);
  const catalog = await discovery.read('catalog.json'); assert.equal(catalog.tests.length,1); assert.equal(catalog.tests[0].project,'unit');
  const run = await call(cwd,'run',{catalogRevision:catalog.catalogRevision,selection:selection(catalog)},'START\n');
  assert.equal(run.result.ok,true,JSON.stringify(run.result)); const report = await run.read('report.json');
  assert.deepEqual(report.tests[0].attempts.map(a=>a.repeatEachIndex).sort(),[0,1]);
  await writeFile(path.join(run.outputRoot,'report.json'),'{corrupt');
  await assert.rejects(readFinalReport(path.join(run.outputRoot,'report.json'),run.manifest,0));
  await assert.rejects(readFinalReport(path.join(run.outputRoot,'missing.json'),run.manifest,0));
});
test('bounded logs and blocked active attachment content', async () => {
  const cwd = await fixture(`test('one',details('one'),async({},info)=>{console.log('x'.repeat(${LIMITS.logBytes + 100})); await info.attach('html',{body:Buffer.from('<script>bad</script>'),contentType:'text/html'});});`);
  const catalog = await discover(cwd), run = await call(cwd, 'run', { catalogRevision: catalog.catalogRevision, selection: selection(catalog) });
  assert.equal(run.result.ok, true, JSON.stringify(run.result));
  const report = await run.read('report.json'); assert.equal(report.logs.truncated, true); assert.ok(Buffer.byteLength(report.tests[0].attempts[0].stdout + report.tests[0].attempts[0].stderr) <= LIMITS.logBytes); assert.equal(report.attachments[0].path,null);
});

test('version 2 runs one invocation per process with its own arguments', async () => {
  const cwd = await fixture(`test('payment', details('A1'), async () => {
  const args = JSON.parse(process.env.TESTORITTO_INVOCATION_ARGUMENTS ?? '{}');
  const id = process.env.TESTORITTO_INVOCATION_ID ?? 'missing';
  appendFileSync('INVOCATIONS', id + '|' + args.baseUrl + String.fromCharCode(10));
  expect(args.baseUrl.startsWith('https://')).toBe(true);
});
test('refund', details('A2'), async () => { appendFileSync('INVOCATIONS', 'A2|' + JSON.parse(process.env.TESTORITTO_INVOCATION_ARGUMENTS ?? '{}').baseUrl + String.fromCharCode(10)); });`);
  const catalog = await discoverV2(cwd);
  const invocations = [
    invocationV2({ invocationId: 'c0000000-0000-4000-8000-000000000001', automationId: 'A1', baseUrl: 'https://stage.example' }),
    invocationV2({ invocationId: 'c0000000-0000-4000-8000-000000000002', automationId: 'A1', baseUrl: 'https://prod.example', environmentId: '33333333-3333-4333-8333-000000000002' }),
    invocationV2({ invocationId: 'c0000000-0000-4000-8000-000000000003', automationId: 'A2', baseUrl: 'https://stage.example' }),
  ];
  const run = await callV2(cwd, 'run', invocations, catalog.catalogRevision);
  assert.equal(run.result.ok, true, JSON.stringify(run.result));
  const report = run.read('report.json');
  assert.equal(report.schemaVersion, 2);
  assert.deepEqual(report.tests.map(t => t.invocationId), invocations.map(i => i.invocationId));
  // Один и тот же тест с разными аргументами даёт две отдельные записи.
  assert.equal(report.tests.filter(t => t.automationId === 'A1').length, 2);
  assert.deepEqual(report.tests.map(t => t.resolvedArguments ?? null).map(v => v), [null, null, null].map(() => null));
  const written = (await readFile(path.join(cwd, 'INVOCATIONS'), 'utf8')).trim().split('\n').sort();
  assert.deepEqual(written, [
    'c0000000-0000-4000-8000-000000000001|https://stage.example',
    'c0000000-0000-4000-8000-000000000002|https://prod.example',
    'A2|https://stage.example',
  ].sort());
  const junit = await readFile(path.join(run.outputRoot, 'junit.xml'), 'utf8');
  assert.match(junit, /testoritto.invocationId/);
  assert.match(junit, /c0000000-0000-4000-8000-000000000002/);
});

test('version 2 discovery catalog and invocation helper contract', async () => {
  const cwd = await fixture(`test('payment', details('A1'), async () => {});`);
  const catalog = await discoverV2(cwd);
  assert.equal(catalog.schemaVersion, 2);
  assert.equal(catalog.tests.length, 1);
  const helper = await import('../dist/invocation.mjs');
  process.env.TESTORITTO_INVOCATION_ID = 'c0000000-0000-4000-8000-000000000009';
  process.env.TESTORITTO_INVOCATION_ARGUMENTS = JSON.stringify({ baseUrl: 'https://stage.example', retries: 2 });
  assert.equal(helper.getInvocationId(), 'c0000000-0000-4000-8000-000000000009');
  assert.deepEqual({ ...helper.getInvocationArguments() }, { baseUrl: 'https://stage.example', retries: 2 });
  delete process.env.TESTORITTO_INVOCATION_ID;
  assert.throws(() => helper.getInvocationId(), /MISSING_INVOCATION_ID/);
  delete process.env.TESTORITTO_INVOCATION_ARGUMENTS;
  assert.deepEqual({ ...helper.getInvocationArguments() }, {});
});
