export { ConfigYamlSchema, type ConfigYaml } from './config';
export { FolderNoteFrontSchema, type FolderNoteFront } from './folder-note';
export { CaseFrontMatterSchema, type CaseFrontMatter } from './case';
// Legacy formats — read only, for migration + a fallback reader (removed after a release or two).
export { WorkspaceYamlSchema, type WorkspaceYaml } from './workspace';
export { SuiteFrontMatterSchema, type SuiteFrontMatter } from './suite';
export {
  CheckStateSchema,
  ApprovalSchema,
  RunDetailsFrontSchema,
  RunCaseFrontSchema,
  type RunDetailsFront,
  type RunCaseFront,
} from './run';

/**
 * A non-blocking import/parse warning (PRD §5.2 tolerance). Surfaced in the UI,
 * never thrown — malformed disk content is coerced with defaults and flagged.
 */
export interface LintWarning {
  code: string;
  message: string;
  file?: string;
}
