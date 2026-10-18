import { useEffect, useState } from 'react';
import { I } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { Menu, type MenuItem } from '@/components/ui';
import { DOCS_URL } from '@/components/common/AboutModal';
import { nwWindow, openExternal } from '@/lib/nwjs';
import { isWindowMaximized } from '@/services/window-state';
import { useApp } from '@/store/app-store';

/* window-control glyphs (VS Code / Windows style) */
const wcProps = { viewBox: '0 0 10 10', width: 10, height: 10, fill: 'none', stroke: 'currentColor', strokeWidth: 1.1 } as const;
const WinMin = () => (
  <svg {...wcProps}>
    <path d="M1 5h8" />
  </svg>
);
const WinMax = () => (
  <svg {...wcProps}>
    <rect x="1.2" y="1.2" width="7.6" height="7.6" />
  </svg>
);
const WinRestore = () => (
  <svg {...wcProps}>
    <path d="M3 3.3V1.2h5.5v5.5H6.6" />
    <rect x="1.3" y="3.3" width="5.4" height="5.4" />
  </svg>
);
const WinClose = () => (
  <svg {...wcProps}>
    <path d="M1.3 1.3l7.4 7.4M8.7 1.3L1.3 8.7" />
  </svg>
);

const winBtn =
  'grid w-[46px] place-items-center border-0 bg-transparent text-ink-2 transition-colors duration-100 [-webkit-app-region:no-drag]';

export function TitleBar() {
  const ctx = useApp();
  const { screen } = ctx;
  // Seed from the live window so a window restored maximized shows the correct glyph.
  const [maximized, setMaximized] = useState(isWindowMaximized);

  // keep the maximize/restore glyph in sync with the real window state. Use
  // removeListener (not removeAllListeners) so the window-state tracker's listeners
  // on the same events survive this component unmounting.
  useEffect(() => {
    const win = nwWindow();
    if (!win) return;
    const onMax = () => setMaximized(true);
    const onRestore = () => setMaximized(false);
    win.on('maximize', onMax);
    win.on('unmaximize', onRestore);
    win.on('restore', onRestore);
    return () => {
      win.removeListener('maximize', onMax);
      win.removeListener('unmaximize', onRestore);
      win.removeListener('restore', onRestore);
    };
  }, []);

  const minimize = () => nwWindow()?.minimize();
  const close = () => nwWindow()?.close();
  const toggleMax = () => {
    const win = nwWindow();
    if (!win) {
      setMaximized((m) => !m);
      return;
    }
    if (maximized) win.unmaximize();
    else win.maximize();
  };

  const menus: { label: string; items: MenuItem[] }[] = [
    {
      label: 'File',
      items: [
        { icon: I.plus, label: 'Add Workspace…', on: () => void ctx.addWorkspace() },
        { icon: I.edit, label: 'Edit Workspace…', on: () => ctx.editWorkspace() },
        { icon: I.trash, label: 'Remove Workspace…', danger: true, on: () => void ctx.removeWorkspace() },
        { sep: true },
        { icon: I.repo, label: 'Repositories', on: () => ctx.goHome() },
        { icon: I.x, label: 'Exit', on: () => nwWindow()?.close() },
      ],
    },
    {
      label: 'Edit',
      items: [
        { icon: I.file, label: 'New Case', on: () => ctx.createCase(null) },
        { icon: I.folder, label: 'New Suite', on: () => ctx.createSuite(null) },
      ],
    },
    {
      label: 'View',
      items: [
        { icon: I.layers, label: 'Cases', on: () => ctx.sel.id && ctx.openCase(ctx.sel.id) },
        { icon: I.grid, label: 'Runs', on: () => ctx.openRunsList() },
        { sep: true },
        { icon: I.sync, label: 'Reload', on: () => nwWindow()?.reload() },
        { icon: I.code, label: 'Toggle Developer Tools', on: () => nwWindow()?.showDevTools?.() },
      ],
    },
    {
      label: 'Git',
      items: [
        { icon: I.pull, label: 'Pull', on: () => ctx.doPull() },
        { icon: I.push, label: 'Push', on: () => ctx.doPush() },
        { sep: true },
        { icon: I.commit, label: 'Commit…', on: () => ctx.setModal('commit') },
      ],
    },
    {
      label: 'Help',
      items: [
        { icon: I.eye, label: 'About Casewright', on: () => ctx.setModal('about') },
        { icon: I.link, label: 'Documentation', on: () => openExternal(DOCS_URL) },
      ],
    },
  ];

  const title = screen === 'main' && ctx.workspace ? `${ctx.workspace.name} — Casewright` : 'Casewright';

  return (
    <div className="relative z-50 flex h-[34px] flex-none items-stretch select-none border-b border-border bg-[linear-gradient(var(--panel-2),oklch(0.972_0.004_80))] [-webkit-app-region:drag]">
      <div className="flex items-center pl-2.5 pr-2">
        <Logo size={16} className="rounded-sm shadow-[0_1px_1px_oklch(0.3_0.05_256/0.3)]" />
      </div>

      {screen === 'main' && (
        <div className="flex items-stretch [-webkit-app-region:no-drag]">
          {menus.map((m) => (
            <Menu
              key={m.label}
              align="start"
              items={m.items}
              trigger={
                <button className="flex items-center border-0 bg-transparent px-[9px] text-[12.5px] text-ink-2 hover:bg-raise data-[state=open]:bg-raise">
                  {m.label}
                </button>
              }
            />
          ))}
        </div>
      )}

      <div
        className="flex min-w-0 flex-1 items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap px-3 text-[12px] tracking-[0.01em] text-ink-3"
        onDoubleClick={toggleMax}
      >
        {title}
      </div>

      <div className="flex items-stretch [-webkit-app-region:no-drag]">
        <button className={winBtn + ' hover:bg-raise'} onClick={minimize} title="Minimize" aria-label="Minimize">
          <WinMin />
        </button>
        <button
          className={winBtn + ' hover:bg-raise'}
          onClick={toggleMax}
          title={maximized ? 'Restore' : 'Maximize'}
          aria-label="Maximize"
        >
          {maximized ? <WinRestore /> : <WinMax />}
        </button>
        <button
          className={winBtn + ' hover:bg-[oklch(0.58_0.21_27)] hover:text-white'}
          onClick={close}
          title="Close"
          aria-label="Close"
        >
          <WinClose />
        </button>
      </div>
    </div>
  );
}
