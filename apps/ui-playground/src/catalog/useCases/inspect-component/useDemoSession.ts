import { useEffect, useRef, useState } from 'react';
export type UseDemoSessionArgs = Record<string, never>;
export type UseDemoSessionResult = { output: string | undefined; report: (value: string) => void; later: (action: () => void, delay: number) => void };
export function useDemoSession(_args: UseDemoSessionArgs = {}): UseDemoSessionResult {
  const [output, report] = useState<string>();
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current.clear(); }, []);
  return { output, report, later: (action, delay) => {
    const timer = setTimeout(() => { timers.current.delete(timer); action(); }, delay);
    timers.current.add(timer);
  } };
}
