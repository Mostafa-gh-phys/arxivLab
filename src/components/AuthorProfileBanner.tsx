import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink, Globe, Loader2, Search, User, X } from 'lucide-react';
import { buildAuthorExternalUrls } from '../shared/inspire';
import type { AuthorResolution } from '../shared/types';

interface AuthorProfileBannerProps {
  authorName: string | null;
  inspireRecid?: string;
  activeTab: 'arxiv' | 'inspirehep';
  onSwitchToArxiv?: (authorName: string) => void;
  onSwitchToInspire?: (authorName: string, inspireRecid?: string) => void;
  onDismiss: () => void;
}

export function AuthorProfileBanner({
  authorName,
  inspireRecid,
  activeTab,
  onSwitchToArxiv,
  onSwitchToInspire,
  onDismiss,
}: AuthorProfileBannerProps) {
  const [resolution, setResolution] = useState<AuthorResolution | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authorName) {
      setResolution(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ name: authorName });
    if (inspireRecid) qs.set('recid', inspireRecid);

    fetch(`/api/author/resolve?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AuthorResolution | null) => {
        if (!cancelled && data) {
          setResolution(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authorName, inspireRecid]);

  if (!authorName) return null;

  const fallback = buildAuthorExternalUrls(authorName, inspireRecid);
  const arxivUrl = resolution?.arxivUrl || fallback.arxivUrl;
  const inspireUrl = resolution?.inspireUrl || fallback.inspireUrl;
  const scholarUrl = resolution?.googleScholarUrl || fallback.googleScholarUrl;

  return (
    <div className="border-b border-blue-100 bg-blue-50/60 px-5 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
            <User className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-900">{authorName}</span>
              {loading ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  <span>Loading profile...</span>
                </span>
              ) : (
                <>
                  {resolution?.inspireAffiliation && (
                    <span className="text-[11px] text-slate-600">
                      · {resolution.inspireAffiliation}
                    </span>
                  )}
                  {resolution?.inspireOrcid && (
                    <span className="font-mono text-[11px] text-slate-500">
                      · ORCID {resolution.inspireOrcid}
                    </span>
                  )}
                  {resolution && resolution.arxivPaperCount > 0 && (
                    <span className="font-mono text-[11px] text-blue-700">
                      · {resolution.arxivPaperCount.toLocaleString()} arXiv papers
                    </span>
                  )}
                </>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {activeTab === 'inspirehep' && onSwitchToArxiv && (
                <button
                  type="button"
                  onClick={() => onSwitchToArxiv(authorName)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Search className="h-3 w-3" aria-hidden="true" />
                  <span>Open in arXiv Tab</span>
                </button>
              )}
              {activeTab === 'arxiv' && onSwitchToInspire && (
                <button
                  type="button"
                  onClick={() =>
                    onSwitchToInspire(authorName, resolution?.inspireRecid || inspireRecid)
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  <BookOpen className="h-3 w-3" aria-hidden="true" />
                  <span>Open in INSPIRE Tab</span>
                </button>
              )}
              <a
                href={arxivUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                <span>arXiv.org Page</span>
                <ExternalLink className="h-3 w-3 text-slate-400" aria-hidden="true" />
              </a>
              <a
                href={inspireUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                <span>{resolution?.inspireUrl ? 'INSPIRE Profile' : 'Search INSPIRE'}</span>
                <ExternalLink className="h-3 w-3 text-slate-400" aria-hidden="true" />
              </a>
              <a
                href={scholarUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                <Globe className="h-3 w-3 text-slate-500" aria-hidden="true" />
                <span>Google Scholar</span>
                <ExternalLink className="h-3 w-3 text-slate-400" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Clear author filter"
          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-blue-100/70 hover:text-slate-700"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
