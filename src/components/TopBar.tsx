import { Plus } from 'lucide-react';
import { AppLogo } from './AppLogo';

export type WorkspaceTab =
  | 'search'
  | 'inspire'
  | 'library'
  | 'zotero'
  | 'cloud'
  | 'mcp'
  | 'settings';

interface TopBarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  savedCount: number;
  onOpenAddById: () => void;
}

const NAV_ITEMS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: 'search', label: 'arXiv' },
  { id: 'inspire', label: 'INSPIRE-HEP' },
  { id: 'library', label: 'Library' },
  { id: 'zotero', label: 'Zotero' },
  { id: 'cloud', label: 'Cloud Sync' },
  { id: 'mcp', label: 'MCP Mode' },
  { id: 'settings', label: 'Settings' },
];

export function TopBar({
  activeTab,
  onSelectTab,
  savedCount,
  onOpenAddById,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-black/[0.08] bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-13 max-w-[1440px] items-center justify-between gap-2 px-3 sm:gap-6 sm:px-6">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('search');
          }}
          className="inline-flex items-center gap-2 text-base font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0 sm:text-[17px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <AppLogo size={24} className="shrink-0 sm:h-[26px] sm:w-[26px]" />
          <span>arXivLab</span>
        </a>

        <nav
          aria-label="Primary workspace navigation"
          className="flex min-w-0 items-center gap-2 overflow-x-auto sm:gap-5"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-3.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 sm:text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  isActive
                    ? 'text-blue-600'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>
                  {item.id === 'mcp' ? (
                    <>
                      MCP<span className="hidden sm:inline"> Mode</span>
                    </>
                  ) : item.id === 'inspire' ? (
                    <>
                      INSPIRE<span className="hidden md:inline">-HEP</span>
                    </>
                  ) : (
                    item.label
                  )}
                  {item.id === 'library' ? (
                    <span className="hidden sm:inline"> ({savedCount})</span>
                  ) : null}
                </span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-600"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={onOpenAddById}
            aria-label="Add by ID"
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0 sm:gap-1.5 sm:px-3.5 sm:text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Add<span className="hidden sm:inline"> by ID</span>
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
