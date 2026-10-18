import { useState } from 'react';
import { Button, DragAndDrop, EmptyState } from '@codaa/ui';
import { DemoFrame, Flag } from '../inspect-component/DemoControls';
import { t } from '../../../shared/i18n/messages';
import styles from '../inspect-component/Demo.module.css';
export function reorder<T>(items:T[],from:number,to:number):T[] { if(from<0||to<0||from>=items.length||to>=items.length)return items;const copy=[...items];const [item]=copy.splice(from,1);copy.splice(to,0,item);return copy; }
export function ReorderDemo() {
  const [items,setItems]=useState(Array.from({length:5},(_,i)=>({id:`item-${i}`,name:`Проверка ${i+1}`})));
  const [empty,setEmpty]=useState(false);
  return <DemoFrame output={items.map(i=>i.id).join(' → ')} controls={<Flag label={t('emptyFixture')} value={empty} onChange={setEmpty} />}>
    {empty ? <EmptyState title={t('empty')} /> : <DragAndDrop items={items} onReorder={setItems}>{(item,i)=><div className={styles.row}><span>{item.name}</span><Button disabled={i===0} onClick={()=>setItems(v=>reorder(v,i,i-1))}>{t('up')}</Button><Button disabled={i===items.length-1} onClick={()=>setItems(v=>reorder(v,i,i+1))}>{t('down')}</Button></div>}</DragAndDrop>}
  </DemoFrame>;
}
