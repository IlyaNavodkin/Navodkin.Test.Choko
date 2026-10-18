import { Component, type ReactNode } from 'react';
import { Alert, Button } from '@codaa/ui';
import { t } from '../../../shared/i18n/messages';
export class DemoBoundary extends Component<{ name: string; reset: () => void; children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) { return { error: error instanceof Error ? error.message : String(error) }; }
  render() { return this.state.error ? <Alert variant="danger" action={<Button onClick={this.props.reset}>{t('retry')}</Button>}>{t('failure')}: {this.props.name} — {this.state.error}</Alert> : this.props.children; }
}
