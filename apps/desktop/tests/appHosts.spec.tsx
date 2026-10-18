import { BlockingOverlayHost, I18nProvider, ToastHost, dismissToast, hideBlockingOverlay, showBlockingOverlay, showToast } from '@codaa/ui';
import { act, cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

function renderHosts() {
  return render(<I18nProvider language="ru"><ToastHost /><BlockingOverlayHost /></I18nProvider>);
}

describe('app hosts', () => {
  afterEach(() => { cleanup(); hideBlockingOverlay(); for (const toast of document.querySelectorAll('[role="status"]')) toast.remove(); });

  it('показывает toast и закрывает его по клику', async () => {
    renderHosts();
    const user = userEvent.setup();
    let id = 0;
    act(() => { id = showToast({ message: 'Профиль сохранён', duration: 0 }); });
    const toast = await screen.findByRole('status');
    expect(toast.textContent).toBe('Профиль сохранён');
    await user.click(toast);
    expect(screen.queryByRole('status')).toBeNull();
    act(() => dismissToast(id));
  });

  it('blocking overlay удерживает фокус и возвращает его после скрытия', async () => {
    renderHosts();
    const user = userEvent.setup();
    const trigger = document.createElement('button');
    trigger.textContent = 'Триггер';
    document.body.append(trigger);
    trigger.focus();
    act(() => showBlockingOverlay('Загружаем репозиторий'));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.getAttribute('aria-busy')).toBe('true');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    act(() => hideBlockingOverlay());
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.body.contains(trigger)).toBe(true);
    trigger.remove();
  });
});
