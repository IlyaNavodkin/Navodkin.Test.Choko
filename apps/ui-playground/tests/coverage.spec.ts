import { describe, expect, it } from 'vitest';
import { checkCoverage, registeredRenderers, runtimeExports } from '../scripts/coverage';
const source="export { Button, helper } from './ui'; export type { Props } from './ui';";
const entry={name:'Button',demo:'buttons',description:'normal/disabled',controls:'disabled',verification:'click'};
const infra=[{name:'helper',reason:'helper'}];const defaults={buttons:{disabled:false}};const renderers=new Set(['buttons']);
describe('AST coverage diagnostics',()=>{
  it('исключает type-only, включая inline type',()=>expect(runtimeExports("export { Button, type Props } from './ui';")).toEqual({values:['Button'],types:['Props']}));
  it('baseline проходит',()=>expect(checkCoverage(source,[entry],infra,renderers,defaults)).toEqual([]));
  it('называет missing/duplicate/unknown/type-only',()=>{
    expect(checkCoverage(source,[],infra,renderers,defaults)).toContain('Missing: Button');
    expect(checkCoverage(source,[entry,entry],infra,renderers,defaults)).toContain('Duplicate: Button');
    expect(checkCoverage(source,[{...entry,name:'Unknown'}],infra,renderers,defaults)).toContain('Unknown: Unknown');
    expect(checkCoverage(source,[{...entry,name:'Props'}],infra,renderers,defaults)).toContain('Type-only: Props');
  });
  it('отклоняет запись без renderer/controls/defaults/verification',()=>expect(checkCoverage(source,[{...entry,controls:'',verification:'',description:''}],infra,new Set(),{})).toEqual(expect.arrayContaining(['Missing renderer: Button → buttons','Missing controls: Button','Missing defaults: Button','Missing variants: Button','Missing verification: Button'])));
  it('отклоняет wildcard и несуществующее renderer binding',()=>{expect(()=>runtimeExports("export * from './ui'")).toThrow('Неподдерживаемая');expect(()=>registeredRenderers('export const renderers = {buttons: Missing};')).toThrow('Неизвестный renderer');});
});
