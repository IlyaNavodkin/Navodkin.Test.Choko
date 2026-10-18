import type { z } from 'zod';
import type { reportSchema } from './schema';
import type { DemoRun } from '../explore-design/types';
export type ReportDocument = z.infer<typeof reportSchema>;
export type ReportKind = ReportDocument['kind'];
export type ReportSource = { kind: ReportKind; runs: DemoRun[]; runId: string; repoName: string; generatedAt: string };
export type ExportFormat = 'pdf' | 'json';
