import { lazy, type ComponentType } from 'react';
import type { DemoId } from './inventory';
import { ActionsDemo } from '../useCases/buttons/ActionsDemo';
import { InputsDemo } from '../useCases/inputs/InputsDemo';
import { FieldValidationDemo } from '../useCases/field-validation/FieldValidationDemo';
import { NavigationDemo } from '../useCases/tabs/NavigationDemo';
import { OverlaysDemo } from '../useCases/menu/OverlaysDemo';
import { TableDemo } from '../useCases/table/TableDemo';
import { FilterChipsDemo } from '../useCases/filter-chips/FilterChipsDemo';
import { FileTreeDemo } from '../useCases/file-tree/FileTreeDemo';
import { ReorderDemo } from '../useCases/reorder-list/ReorderDemo';
import { FeedbackDemo } from '../useCases/alert/FeedbackDemo';
import { ToastDemo } from '../useCases/toast/ToastDemo';
import { BlockingDemo } from '../useCases/blocking-overlay/BlockingDemo';
import { LayoutDemo } from '../useCases/accordion/LayoutDemo';
import { PageShellDemo } from '../useCases/page-shell/PageShellDemo';
import { ContentDemo } from '../useCases/icons/ContentDemo';
import { AudioDemo } from '../useCases/sound-player/AudioDemo';
import { UploadDemo } from '../useCases/upload/UploadDemo';
const BackgroundDemo = lazy(() => import('../useCases/background/BackgroundDemo').then(m => ({default:m.BackgroundDemo})));
export const renderers = {
  buttons: ActionsDemo, 'button-group': ActionsDemo, 'control-buttons': ActionsDemo, 'icon-buttons': ActionsDemo,
  'section-button': ActionsDemo, 'split-button': ActionsDemo,
  inputs: InputsDemo, textarea: InputsDemo, 'search-input': InputsDemo, checkbox: InputsDemo, toggle: InputsDemo, slider: InputsDemo, 'color-picker': InputsDemo, select: InputsDemo,
  'field-validation': FieldValidationDemo,
  breadcrumbs: NavigationDemo, tabs: NavigationDemo, segmented: NavigationDemo, 'pagination-indicator': NavigationDemo,
  menu: OverlaysDemo, popover: OverlaysDemo, modal: OverlaysDemo, confirm: OverlaysDemo,
  table: TableDemo, 'filter-chips': FilterChipsDemo, 'file-tree': FileTreeDemo, 'reorder-list': ReorderDemo,
  alert: FeedbackDemo, badge: FeedbackDemo, 'dot-chip': FeedbackDemo, 'status-pill': FeedbackDemo, 'empty-state': FeedbackDemo, 'loading-state': FeedbackDemo, skeleton: FeedbackDemo, spinner: FeedbackDemo, progress: FeedbackDemo,
  toast: ToastDemo, 'blocking-overlay': BlockingDemo,
  accordion: LayoutDemo, 'accent-rail': LayoutDemo, divider: LayoutDemo, 'floating-toolbar': LayoutDemo, 'group-label': LayoutDemo, 'resize-handle': LayoutDemo, 'split-pane': LayoutDemo,
  'page-shell': PageShellDemo,
  icons: ContentDemo, avatar: ContentDemo, markdown: ContentDemo, background: BackgroundDemo,
  'sound-player': AudioDemo, waveform: AudioDemo, upload: UploadDemo, 'drop-overlay': UploadDemo,
} satisfies Record<DemoId, ComponentType<{ demo: DemoId }>>;
