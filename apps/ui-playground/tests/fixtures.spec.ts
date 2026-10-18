import { expect, it } from 'vitest';
import { moveNode, treeFixture } from '../src/catalog/useCases/file-tree/fixtures';
import { reorder } from '../src/catalog/useCases/reorder-list/ReorderDemo';
it('переносит fixture, отклоняет цикл и disabled, не изменяет оригинал',()=>{expect(moveNode(treeFixture,{nodeId:'file',targetFolderId:'runs'})?.find(n=>n.id==='file')?.parentId).toBe('runs');expect(treeFixture.find(n=>n.id==='file')?.parentId).toBe('nested');expect(moveNode(treeFixture,{nodeId:'cases',targetFolderId:'nested'})).toBeNull();expect(moveNode(treeFixture,{nodeId:'disabled',targetFolderId:'runs'})).toBeNull();});
it('reorder сохраняет ids и не теряет элемент на краях',()=>{expect(reorder(['a','b','c'],0,2)).toEqual(['b','c','a']);expect(reorder(['a'],0,-1)).toEqual(['a']);});
