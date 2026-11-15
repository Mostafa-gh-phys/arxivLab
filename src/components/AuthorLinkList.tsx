import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { BookOpen, ExternalLink, Globe, Loader2, Search, X } from 'lucide-react';
import { buildAuthorExternalUrls } from '../shared/inspire';
import type { AuthorDetail, AuthorResolution } from '../shared/types';

interface AuthorLinkListProps {
  authors: string[];
  authorDetails?: AuthorDetail[];
  maxVisible?: number;
  preferSource?: 'arxiv' | 'inspirehep';
  onSearchAuthorInArxiv?: (authorName: string) => void;
  onSearchAuthorInInspire?: (authorName: string, inspireRecid?: string) => void;
  className?: string;
}

const resolutionCache = new Map<string, AuthorResolution>();

export function AuthorLinkList({
  authors,
  authorDetails,
  maxVisible = 5,
  preferSource = 'arxiv',
  onSearchAuthorInArxiv,
  onSearchAuthorInInspire,
  className = '',
}: AuthorLinkListProps) {
  const [activeAuthor, setActiveAuthor] = useState<{
    name: string;
    recid?: string;
    x: number;
    y: number;
    mode: 'click' | 'context';
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolution, setResolution] = useState<AuthorResolution | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeAuthor) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveAuthor(null);
    };
    const handleOutside = (e: globalThis.MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActiveAuthor(null);
      }
    };

    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleOutside);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleOutside);
    };
  }, [activeAuthor]);

  const openAuthorMenu = async (
    e: MouseEvent<HTMLButtonElement>,
    name: string,
    mode: 'click' | 'context'
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const detail = authorDetails?.find((d) => d.name === name);
    const recid = detail?.inspireRecid;

    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = mode === 'context' ? e.clientX : rect.left;
    const rawY = mode === 'context' ? e.clientY + 6 : rect.bottom + 6;
    const clampedX = Math.max(12, Math.min(rawX, window.innerWidth - 332));
    const clampedY = Math.max(12, Math.min(rawY, window.innerHeight - 310));

    setActiveAuthor({ name, recid, x: clampedX, y: clampedY, mode });

    const cacheKey = `${name.toLowerCase()}::${recid || ''}`;
    const cached = resolutionCache.get(cacheKey);
    if (cached) {
      setResolution(cached);
      setLoading(false);
      return;
    }

    setResolution(null);
    setLoading(true);
    try {
      const qs = new URLSearchParams({ name });
      if (recid) qs.set('recid', recid);
      const res = await fetch(`/api/author/resolve?${qs.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as AuthorResolution;
        resolutionCache.set(cacheKey, data);
        setResolution(data);
      }
    } catch {
      // Fallback URLs still work if offline
    } finally {
      setLoading(false);
    }
  };

  const visibleAuthors = maxVisible > 0 ? authors.slice(0, maxVisible) : authors;
  const remaining = authors.length - visibleAuthors.length;

  const fallbackUrls = activeAuthor
    ? buildAuthorExternalUrls(activeAuthor.name, activeAuthor.recid)
    : null;

  const arxivUrl = resolution?.arxivUrl || fallbackUrls?.arxivUrl || '#';
  const inspireUrl =
    resolution?.inspireUrl ||
    (activeAuthor?.recid ? fallbackUrls?.inspireUrl : null) ||
    fallbackUrls?.inspireUrl ||
    '#';
  const scholarUrl = resolution?.googleScholarUrl || fallbackUrls?.googleScholarUrl || '#';

  const noDirectPageFound = Boolean(resolution && !resolution.hasDirectPage);

  return (
    <>
      <p className={`text-xs text-slate-600 ${className}`}>
        {visibleAuthors.map((author, idx) => (
          <span key={`${author}-${idx}`}>
            {idx > 0 && ', '}
            <button
              type="button"
              onClick={(e) => void openAuthorMenu(e, author, 'click')}
              onContextMenu={(e) => void openAuthorMenu(e, author, 'context')}
              title={`Click or right-click to open ${author} on arXiv, INSPIRE-HEP, or Google Scholar`}
              className="inline text-left text-slate-700 underline-offset-2 transition-colors hover:text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              {author}
            </button>
          </span>
        ))}
        {remaining > 0 ? ` +${remaining} more` : ''}
      </p>

      {activeAuthor && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`Author profiles for ${activeAuthor.name}`}
          style={{ left: `${activeAuthor.x}px`, top: `${activeAuthor.y}px` }}
          className="fixed z-50 w-80 rounded-xl border border-black/[0.1] bg-white p-3.5 shadow-xl"
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {activeAuthor.name}
              </p>
              {loading ? (
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  <span>Checking arXiv & INSPIRE-HEP...</span>
                </p>
              ) : resolution?.inspireAffiliation ? (
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {resolution.inspireAffiliation}
                  {resolution.inspireOrcid ? ` · ORCID ${resolution.inspireOrcid}` : ''}
                </p>
              ) : noDirectPageFound ? (
                <p className="mt-0.5 text-[11px] text-amber-700">
                  No arXiv or INSPIRE profile found · Google Scholar ready
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {resolution && resolution.arxivPaperCount > 0
                    ? `${resolution.arxivPaperCount.toLocaleString()} arXiv papers`
                    : 'Choose destination'}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setActiveAuthor(null)}
              aria-label="Close author menu"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-2.5 space-y-1.5">
            {noDirectPageFound ? (
              <a
                href={scholarUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setActiveAuthor(null)}
                className="flex w-full items-center justify-between rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
              >
                <span className="inline-flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Open on Google Scholar (Fallback)</span>
                </span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            ) : (
              <>
                {preferSource === 'inspirehep' && resolution?.inspireUrl && (
                  <a
                    href={inspireUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setActiveAuthor(null)}
                    className="flex w-full items-center justify-between rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                  >
                    <span className="inline-flex items-center gap-2">
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Open INSPIRE-HEP Author Page</span>
                    </span>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}

                {(!resolution || resolution.arxivPaperCount > 0 || preferSource === 'arxiv') && (
                  <a
                    href={arxivUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setActiveAuthor(null)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      preferSource === 'arxiv' || !resolution?.inspireUrl
                        ? 'bg-blue-600 font-semibold text-white hover:bg-blue-700'
                        : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Search className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        arXiv Author Papers
                        {resolution?.arxivPaperCount ? ` (${resolution.arxivPaperCount})` : ''}
                      </span>
                    </span>
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}

                {(preferSource !== 'inspirehep' || !resolution?.inspireUrl) && (
                  <a
                    href={inspireUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setActiveAuthor(null)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50"
                  >
                    <span className="inline-flex items-center gap-2">
                      <BookOpen className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                      <span>
                        {resolution?.inspireUrl
                          ? 'Open INSPIRE-HEP Profile'
                          : 'Search INSPIRE-HEP Authors'}
                      </span>
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  </a>
                )}

                <a
                  href={scholarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setActiveAuthor(null)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                    <span>Open Google Scholar</span>
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                </a>
              </>
            )}

            {(onSearchAuthorInArxiv || onSearchAuthorInInspire) && (
              <div className="grid grid-cols-2 gap-1.5 border-t border-slate-100 pt-2">
                {onSearchAuthorInArxiv && (
                  <button
                    type="button"
                    onClick={() => {
                      const name = activeAuthor.name;
                      setActiveAuthor(null);
                      onSearchAuthorInArxiv(name);
                    }}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Open in arXiv Tab
                  </button>
                )}
                {onSearchAuthorInInspire && (
                  <button
                    type="button"
                    onClick={() => {
                      const name = activeAuthor.name;
                      const recid = resolution?.inspireRecid || activeAuthor.recid;
                      setActiveAuthor(null);
                      onSearchAuthorInInspire(name, recid);
                    }}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                  >
                    Open in INSPIRE Tab
                  </button>
                )}
              </div>
            )}
          </div>

          {resolution && resolution.arxivSamplePapers.length > 0 && (
            <div className="mt-2.5 border-t border-slate-100 pt-2">
              <p className="text-[11px] font-medium text-slate-500">Latest on arXiv</p>
              <ul className="mt-1 space-y-1">
                {resolution.arxivSamplePapers.map((sample) => (
                  <li key={sample.id} className="truncate text-[11px] text-slate-700">
                    <a
                      href={`https://arxiv.org/abs/${sample.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-blue-700 hover:underline"
                    >
                      <span className="font-mono text-slate-500">{sample.id}</span> · {sample.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
