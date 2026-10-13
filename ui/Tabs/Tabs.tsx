'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import styles from './Tabs.module.css';

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tabs compound components must be used within Tabs');
  return context;
}

export type TabsProps = HTMLAttributes<HTMLDivElement> & {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
};

/** Underline tabs with horizontal scroll when labels overflow the container. */
export function Tabs({ value, onValueChange, className = '', children, ...props }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector('[role="tab"][aria-selected="true"]');
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }, [value]);

  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div
        ref={listRef}
        className={`${styles.tabs} ${className}`.trim()}
        role="tablist"
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export type TabProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
};

export function Tab({ value, className = '', type = 'button', children, onClick, ...props }: TabProps) {
  const { value: active, onValueChange } = useTabsContext();
  const selected = active === value;

  return (
    <button
      {...props}
      type={type}
      role="tab"
      aria-selected={selected}
      className={`${styles.tab} ${selected ? styles.tabActive : ''} ${className}`.trim()}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onValueChange(value);
      }}
    >
      {children}
    </button>
  );
}
