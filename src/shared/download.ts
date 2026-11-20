import { Capacitor } from '@capacitor/core';
import { buildSafePdfDownloadFilename } from './arxiv';
import type { ArxivPaper } from './types';

export function buildPdfEndpointUrl(
  paper: Pick<ArxivPaper, 'id' | 'title'> & { pdfUrl?: string },
  options: { save?: boolean; view?: boolean } = {}
): string {
  if (Capacitor.isNativePlatform()) {
    if (paper.pdfUrl && /^https?:\/\//i.test(paper.pdfUrl)) {
      return paper.pdfUrl;
    }
    const cleanId = paper.id.replace(/^arXiv:/i, '').replace(/v\d+$/i, '');
    return `https://arxiv.org/pdf/${cleanId}`;
  }
  const qs = new URLSearchParams({
    id: paper.id,
    save: options.save === false ? '0' : '1',
    title: paper.title,
  });
  if (options.view) {
    qs.set('view', '1');
  }
  return `/api/arxiv/download?${qs.toString()}`;
}

export async function triggerPaperPdfDownload(
  paper: Pick<ArxivPaper, 'id' | 'title'> & { pdfUrl?: string }
): Promise<{ fileName: string; sizeBytes: number }> {
  const url = buildPdfEndpointUrl(paper, { save: true, view: false });
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(errJson?.error || `PDF download failed with HTTP ${res.status}`);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const blob = await res.blob();
  if (!contentType.includes('pdf') && blob.size < 100) {
    throw new Error('Upstream returned an invalid PDF response.');
  }

  const fileName = buildSafePdfDownloadFilename(paper.id, paper.title);
  const blobUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
  }

  return { fileName, sizeBytes: blob.size };
}
