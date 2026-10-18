import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { visualEntries, infrastructureEntries } from '../src/catalog/registry/inventory.ts';
import { scenarioDefaults } from '../src/catalog/registry/scenarios.ts';
import { checkCoverage, registeredRenderers } from './coverage.ts';
const root=new URL('../',import.meta.url);
const read=(path:string)=>readFileSync(new URL(path,root),'utf8');
const source=read('src/catalog/registry/renderers.tsx');
const errors=checkCoverage(read('../../ui/index.ts'),visualEntries,infrastructureEntries,registeredRenderers(source),scenarioDefaults);
const matrix=read('../../openspec/changes/add-ui-component-playground/coverage-matrix.md');
for(const entry of [...visualEntries,...infrastructureEntries]) if(!matrix.includes(`| \`${entry.name}\` |`)) errors.push(`Missing matrix row: ${entry.name}`);
const file=ts.createSourceFile('renderers.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
for(const statement of file.statements)if(ts.isImportDeclaration(statement)&&ts.isStringLiteral(statement.moduleSpecifier)&&statement.moduleSpecifier.text.startsWith('.')){
  const base=new URL(statement.moduleSpecifier.text,new URL('src/catalog/registry/renderers.tsx',root));
  if(!['.tsx','.ts'].some(ext=>existsSync(fileURLToPath(base)+ext)))errors.push(`Missing renderer module: ${base}`);
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Public API: ${visualEntries.length+infrastructureEntries.length} = ${visualEntries.length} visual + ${infrastructureEntries.length} infrastructure. Registry/matrix/renderers/defaults/variants/controls/verification: PASS. Browser evidence проверяется отдельно.`);
