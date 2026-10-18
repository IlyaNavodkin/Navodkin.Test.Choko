import ts from 'typescript';
export type CoverageEntry = { name: string; demo: string; description: string; controls: string; verification: string };
export function runtimeExports(source: string): { values: string[]; types: string[] } {
  const file = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  const values: string[] = [], types: string[] = [];
  for (const statement of file.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) throw Error(`Неподдерживаемая форма public export: ${statement.getText(file)}`);
    for (const element of statement.exportClause.elements) (statement.isTypeOnly || element.isTypeOnly ? types : values).push(element.name.text);
  }
  return { values, types };
}
export function checkCoverage(source: string, entries: readonly CoverageEntry[], infrastructure: readonly {name:string;reason:string}[], renderers: ReadonlySet<string>, defaults: Record<string,Record<string,unknown>>) {
  const {values,types} = runtimeExports(source);
  const errors: string[] = [];
  const names = new Set<string>();
  for (const entry of [...entries,...infrastructure]) {
    if (names.has(entry.name)) errors.push(`Duplicate: ${entry.name}`); names.add(entry.name);
    if (!values.includes(entry.name)) errors.push(`${types.includes(entry.name)?'Type-only':'Unknown'}: ${entry.name}`);
    if ('reason' in entry && !entry.reason.trim()) errors.push(`Missing reason: ${entry.name}`);
  }
  for (const name of values) if (!names.has(name)) errors.push(`Missing: ${name}`);
  for (const entry of entries) {
    if (!renderers.has(entry.demo)) errors.push(`Missing renderer: ${entry.name} → ${entry.demo}`);
    if (!defaults[entry.demo] || Object.keys(defaults[entry.demo]).length === 0) errors.push(`Missing defaults: ${entry.name}`);
    if (!entry.description.trim()) errors.push(`Missing variants: ${entry.name}`);
    if (!entry.controls.trim()) errors.push(`Missing controls: ${entry.name}`);
    if (!entry.verification.trim()) errors.push(`Missing verification: ${entry.name}`);
  }
  return errors;
}
export function registeredRenderers(source: string): Set<string> {
  const file=ts.createSourceFile('renderers.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const bindings=new Set<string>();
  for(const statement of file.statements){
    if(ts.isImportDeclaration(statement)&&statement.importClause?.namedBindings&&ts.isNamedImports(statement.importClause.namedBindings)) for(const e of statement.importClause.namedBindings.elements) bindings.add(e.name.text);
    if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)if(ts.isIdentifier(declaration.name)&&declaration.initializer)bindings.add(declaration.name.text);
  }
  const result=new Set<string>();
  function visit(node:ts.Node){
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='renderers'&&node.initializer){
      const object=ts.isSatisfiesExpression(node.initializer)?node.initializer.expression:node.initializer;
      if(!ts.isObjectLiteralExpression(object))throw Error('Registry renderers должен быть явным object literal');
      for(const prop of object.properties){
        if(!ts.isPropertyAssignment(prop)||!ts.isIdentifier(prop.initializer)||!bindings.has(prop.initializer.text))throw Error(`Неизвестный renderer: ${prop.getText(file)}`);
        result.add(ts.isIdentifier(prop.name)||ts.isStringLiteral(prop.name)?prop.name.text:prop.name.getText(file));
      }
    }
    ts.forEachChild(node,visit);
  }visit(file);return result;
}
