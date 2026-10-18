import { canMoveIntoFolder, type FileTreeNode, type FileTreeMovePayload } from '@codaa/ui';
export const treeFixture: FileTreeNode[] = [{ id:'cases',kind:'folder',name:'Кейсы',parentId:null },{ id:'nested',kind:'folder',name:'Формы',parentId:'cases' },{ id:'runs',kind:'folder',name:'Прогоны',parentId:null },{ id:'file',kind:'file',name:'Проверка.md',parentId:'nested' },{ id:'disabled',kind:'file',name:'Недоступный.md',parentId:'cases',disabled:true }];
export function moveNode(nodes: FileTreeNode[], { nodeId, targetFolderId }: FileTreeMovePayload): FileTreeNode[] | null {
  const node = nodes.find(n=>n.id === nodeId);
  if (!node || node.disabled || (targetFolderId !== null && !nodes.some(n=>n.id === targetFolderId && n.kind === 'folder' && !n.disabled)) || !canMoveIntoFolder(nodes,nodeId,targetFolderId)) return null;
  return nodes.map(n=>n.id === nodeId ? {...n,parentId:targetFolderId} : n);
}
