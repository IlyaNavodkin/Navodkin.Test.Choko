'use client';

import { useState, type DragEvent, type HTMLAttributes, type ReactNode } from 'react';
import styles from './DragAndDrop.module.css';

type DragAndDropProps<T extends { id: string }> = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  items: T[];
  onReorder: (items: T[]) => void;
  children: (item: T, index: number) => ReactNode;
};

/** Native HTML drag-and-drop list ported from Koster UI. */
export function DragAndDrop<T extends { id: string }>({
  items,
  onReorder,
  children,
  className = '',
  ...props
}: DragAndDropProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const reset = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, index: number) => {
    setDragIndex(index);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      reset();
      return;
    }
    const reorderedItems = [...items];
    const [movedItem] = reorderedItems.splice(dragIndex, 1);
    reorderedItems.splice(index, 0, movedItem);
    onReorder(reorderedItems);
    reset();
  };

  return (
    <div className={`${styles.list} ${className}`.trim()} {...props}>
      {items.map((item, index) => (
        <div
          key={item.id}
          className={`${styles.item} ${dragIndex === index ? styles.dragging : ''} ${
            dragOverIndex === index && dragIndex !== index ? styles.over : ''
          }`.trim()}
          draggable
          onDragEnd={reset}
          onDragOver={(event) => handleDragOver(event, index)}
          onDragStart={(event) => handleDragStart(event, index)}
          onDrop={() => handleDrop(index)}
        >
          {children(item, index)}
        </div>
      ))}
    </div>
  );
}

export type { DragAndDropProps };
