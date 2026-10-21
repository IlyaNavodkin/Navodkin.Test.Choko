import { useEffect, useRef } from 'react';
import { I } from '@/components/icons';
import { MascotButton } from './MascotButton';
import { useApp, useAppStore } from '@/store/app-store';

interface ModuleNavProps {
  casesSidebarOpen: boolean;
  onToggleCases: () => void;
}

/** Repository modules stay available while each module owns its content area. */
export function ModuleNav({ casesSidebarOpen, onToggleCases }: ModuleNavProps) {
  const { view, sel, cases, tree, openCase, openSuite, openRunsList, openReferenceBook, openAutomationSection, guardRefLeave } = useApp();
  const casesActive = view === 'editor' || view === 'suite';
  const lastCases = useRef({ view, sel });
  useEffect(() => {
    if (casesActive) lastCases.current = { view, sel };
  }, [casesActive, view, sel]);

  const openCases = () => {
    if (casesActive) {
      onToggleCases();
      return;
    }
    const previous = lastCases.current;
    if (previous.view === 'suite' && previous.sel.suiteId) {
      openSuite(previous.sel.suiteId);
      return;
    }
    const caseId = cases.find((c) => c.id === previous.sel.id)?.id ?? cases[0]?.id;
    if (caseId) openCase(caseId);
    else if (tree[0]?.type === 'suite') openSuite(tree[0].id);
    else if (guardRefLeave('cases', openCases)) useAppStore.setState({ view: 'editor' });
  };

  const modules = [
    { label: 'Cases', title: 'Cases · workspaces — click again to show or hide the explorer', icon: I.layers, active: casesActive, onClick: openCases },
    { label: 'Runs', title: 'Runs', icon: I.grid, active: view === 'runs' || view === 'run' || view === 'runAutomation' || view === 'guide', onClick: openRunsList },
    { label: 'Reference', title: 'Reference', icon: I.link, active: view === 'glossary', onClick: openReferenceBook },
    { label: 'Autotests', title: 'Autotests', icon: I.test, active: view === 'automation', onClick: () => {
      if (guardRefLeave('autotests', openAutomationSection)) openAutomationSection();
    } },
  ];

  return (
    <nav aria-label="Modules" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-panel-2 px-2 py-3">
      <MascotButton />
      {modules.map((module) => (
        <button
          key={module.label}
          type="button"
          title={module.title}
          aria-label={module.label === 'Cases' ? 'Cases (workspaces)' : module.label}
          aria-current={module.active ? 'page' : undefined}
          aria-controls={module.label === 'Cases' ? 'cases-sidebar' : undefined}
          aria-expanded={module.label === 'Cases' ? casesActive && casesSidebarOpen : undefined}
          onClick={module.onClick}
          className="module-nav-button grid size-10 shrink-0 place-items-center rounded-md text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="module-nav-icon" aria-hidden="true">{module.icon({ size: 20 })}</span>
        </button>
      ))}
    </nav>
  );
}
