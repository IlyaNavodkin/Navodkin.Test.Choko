import { useMemo, useState } from 'react';
import type { RunCaseEdit, RunCaseResource } from '../../api/contracts';
export type GuideSection = 'setup' | 'steps' | 'accept';
export type UseRunGuideArgs = { model: RunCaseResource['document']['model']; values: RunCaseEdit };
export function useRunGuide({ model, values }: UseRunGuideArgs) {
  const items = useMemo(() => (['setup', 'steps', 'accept'] as const).flatMap((section) => model[section].map((item, index) => ({ section, index, ...item }))), [model]);
  const [position, setPosition] = useState(0);
  const cursor = Math.min(position, items.length);
  const checked = [...values.setup, ...values.steps, ...values.accept].filter((item) => item.state !== 'none').length;
  return { item: items[cursor], cursor, total: items.length, checked, isRecord: cursor === items.length,
    previous: () => setPosition(Math.max(0, cursor - 1)), next: () => setPosition(Math.min(items.length, cursor + 1)), record: () => setPosition(items.length) };
}
export type UseRunGuideResult = ReturnType<typeof useRunGuide>;
