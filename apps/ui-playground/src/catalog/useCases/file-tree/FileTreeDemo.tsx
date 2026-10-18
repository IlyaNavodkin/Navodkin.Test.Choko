import { useState } from 'react';
import * as UI from '@codaa/ui';
import { treeFixture, moveNode } from './fixtures';
import { DemoFrame, Flag } from '../inspect-component/DemoControls';
import { t } from '../../../shared/i18n/messages';
export function FileTreeDemo() {
  const [nodes,setNodes] = useState(treeFixture);
  const [selected,setSelected] = useState<string|null>(null);
  const [expanded,setExpanded] = useState(['cases','nested','runs']);
  const [empty,setEmpty] = useState(false);
  const [output,setOutput] = useState<string>();
  const move = (payload: UI.FileTreeMovePayload) => { const result=moveNode(nodes,payload); if(result){setNodes(result);setOutput(`${payload.nodeId} → ${payload.targetFolderId}`);} else setOutput(t('invalid')); };
  return <DemoFrame output={output ?? selected ?? undefined} controls={<><Flag label={t('emptyFixture')} value={empty} onChange={setEmpty} /><UI.Button onClick={()=>move({nodeId:'file',targetFolderId:nodes.find(n=>n.id==='file')?.parentId==='runs' ? 'nested' : 'runs'})}>{t('move')}</UI.Button><UI.Button onClick={()=>move({nodeId:'cases',targetFolderId:'nested'})}>{t('invalidMove')}</UI.Button></>}>
    <UI.FileTree aria-label={t('example')} nodes={empty?[]:nodes} selectedId={selected} expandedIds={expanded} onSelect={n=>setSelected(n.id)} onToggle={(n,open)=>setExpanded(ids=>open?[...ids,n.id]:ids.filter(id=>id!==n.id))} onMove={move} rowActions={node=><UI.Menu><UI.MenuTrigger aria-label={`${t('action')} ${node.name}`}><UI.Icon name={UI.IconNames.plus} /></UI.MenuTrigger><UI.MenuItem onClick={()=>setOutput(node.name)}>{t('action')}</UI.MenuItem></UI.Menu>} />
  </DemoFrame>;
}
