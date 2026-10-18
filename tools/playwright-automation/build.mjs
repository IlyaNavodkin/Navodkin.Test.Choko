import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
const notices = (await Promise.all(['zod-LICENSE.txt', 'saxes-LICENSE.txt', 'xmlchars-LICENSE.txt'].map(file => readFile(`third-party/${file}`, 'utf8')))).join('\n\n');
for (const entry of ['index', 'reporter', 'bridge']) {
  const result = await build({
    entryPoints: [`src/${entry}.ts`], outfile: `dist/${entry}.mjs`, bundle: true,
    format: 'esm', platform: entry === 'index' ? 'browser' : 'node', target: 'es2022',
    legalComments: 'eof', metafile: true, banner: { js: `/* Third-party licenses\n${notices.replaceAll('*/', '* /')}\n*/` },
  });
  await writeFile(`dist/${entry}.meta.json`, JSON.stringify(result.metafile));
}
