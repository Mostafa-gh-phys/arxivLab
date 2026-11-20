import { useState } from 'react';
import {
  Atom,
  Bookmark,
  Cloud,
  Cpu,
  Menu,
  Search,
  Send,
  Settings,
  X,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';
import type { WorkspaceTab } from './TopBar';

interface MobileBottomNavProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  savedCount: number;
}

export function MobileBottomNav({
  activeTab,
  onSelectTab,
  savedCount,
}: MobileBottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = activeTab === 'zotero' || activeTab === 'mcp' || activeTab === 'settings';

  const handleSelect = (tab: WorkspaceTab) => {
    setMoreOpen(false);
    onSelectTab(tab);
  };

  return (
    <>
      {moreOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/35 backdrop-blur-[1px] md:hidden"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}

      {moreOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Additional tools and settings"
          className="fixed inset-x-3 bottom-20 z-40 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl md:hidden"
        >
          <div className="mb-2 flex items-center justify-between px-2 pt-1">
            <span className="text-xs font-semibold text-slate-900">Workstation Tools</span>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              aria-label="Close tools menu"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            <button
              type="button"
              onClick={() => handleSelect('zotero')}
              className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-left text-xs font-medium ${
                activeTab === 'zotero'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Send className="h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-semibold">Zotero Sync</div>
                <div className="text-[11px] text-slate-500">Web API &amp; collection push</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelect('mcp')}
              className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-left text-xs font-medium ${
                activeTab === 'mcp'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Cpu className="h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-semibold">MCP Mode</div>
                <div className="text-[11px] text-slate-500">AI agent server configuration</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelect('settings')}
              className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-left text-xs font-medium ${
                activeTab === 'settings'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Settings className="h-4 w-4 shrink-0" aria-hidden="true" />
              <div>
                <div className="font-semibold">Settings &amp; Android / Desktop</div>
                <div className="text-[11px] text-slate-500">DNS, PWA install, APK &amp; Play Bundle</div>
              </div>
            </button>
          </div>
          <div className="mt-2 border-t border-slate-100 px-2 pt-2">
            <PWAInstallButton />
          </div>
        </div>
      )}

      <nav
        aria-label="Mobile bottom navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.08] bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="grid h-15 grid-cols-5 items-center">
          <button
            type="button"
            onClick={() => handleSelect('search')}
            aria-current={activeTab === 'search' ? 'page' : undefined}
            className={`flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              activeTab === 'search' ? 'text-blue-600' : 'text-slate-500'
            }`}
          >
            <Search className="h-4.5 w-4.5" aria-hidden="true" />
            <span>arXiv</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelect('inspire')}
            aria-current={activeTab === 'inspire' ? 'page' : undefined}
            className={`flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              activeTab === 'inspire' ? 'text-blue-600' : 'text-slate-500'
            }`}
          >
            <Atom className="h-4.5 w-4.5" aria-hidden="true" />
            <span>INSPIRE</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelect('library')}
            aria-current={activeTab === 'library' ? 'page' : undefined}
            className={`relative flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              activeTab === 'library' ? 'text-blue-600' : 'text-slate-500'
            }`}
          >
            <div className="relative">
              <Bookmark className="h-4.5 w-4.5" aria-hidden="true" />
              {savedCount > 0 && (
                <span className="absolute -top-1.5 -right-2.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white tabular-nums">
                  {savedCount > 99 ? '99+' : savedCount}
                </span>
              )}
            </div>
            <span>Library</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelect('cloud')}
            aria-current={activeTab === 'cloud' ? 'page' : undefined}
            className={`flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              activeTab === 'cloud' ? 'text-blue-600' : 'text-slate-500'
            }`}
          >
            <Cloud className="h-4.5 w-4.5" aria-hidden="true" />
            <span>Cloud</span>
          </button>

          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={`flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
              moreOpen || isMoreActive ? 'text-blue-600' : 'text-slate-500'
            }`}
          >
            <Menu className="h-4.5 w-4.5" aria-hidden="true" />
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
