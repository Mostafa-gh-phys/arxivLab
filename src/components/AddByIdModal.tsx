import { useState, type FormEvent } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import type { ArxivPaper } from '../shared/types';

interface AddByIdModalProps {
  open: boolean;
  onClose: () => void;
  onPaperSaved: (paper: ArxivPaper) => Promise<void>;
}

export function AddByIdModal({ open, onClose, onPaperSaved }: AddByIdModalProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ArxivPaper | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) {
      setError('Enter an arXiv ID or URL (e.g. hep-th/9711200 or 2401.12345).');
      return;
    }
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch(`/api/arxiv/paper?id=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not locate paper on arxiv.org.');
      }
      setPreview(data.paper);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await onPaperSaved(preview);
      setInput('');
      setPreview(null);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-by-id-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between gap-4">
          <h2 id="add-by-id-title" className="text-base font-semibold text-slate-900">
            Fetch &amp; Save arXiv Paper by ID
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Add by ID dialog"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleLookup} className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="arxiv-id-input"
              className="block text-xs font-medium text-slate-700"
            >
              arXiv Identifier or URL
            </label>
            <div className="mt-1.5 flex gap-2">
              <input
                id="arxiv-id-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. 2401.12345, hep-th/9711200, or https://arxiv.org/abs/..."
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Lookup</span>
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs font-medium text-rose-700">
              {error}
            </p>
          )}
        </form>

        {preview && (
          <div className="mt-5 space-y-3 border-t border-slate-200 pt-4">
            <div className="text-xs font-mono text-slate-500 tabular-nums">
              {preview.primaryCategory} · {preview.published.slice(0, 10)} · arXiv:{preview.id}
            </div>
            <h3 className="font-serif text-base font-semibold text-slate-900">
              {preview.title}
            </h3>
            <p className="text-xs text-slate-600">{preview.authors.join(', ')}</p>
            <p className="line-clamp-3 text-xs leading-relaxed text-slate-700">
              {preview.abstract}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                <span>Save to Linux Library</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
